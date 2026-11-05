import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

// Address ranges the worker must never reach unless the host is explicitly allow-listed:
// loopback, private, carrier-grade NAT, link-local (incl. cloud metadata 169.254.169.254), ULA. (IPv4-mapped IPv6 like ::ffff:10.0.0.1 is matched against the IPv4 rules by BlockList.)
const blocked = new BlockList();
for (const [net, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3]]) {
  blocked.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [['::', 128], ['::1', 128], ['64:ff9b::', 96],
  ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

export const isBlockedAddress = (address) => blocked.check(address, isIP(address) === 6 ? 'ipv6' : 'ipv4');

export const allowedHostsFromEnv = (value = process.env.ALLOWED_INTERNAL_HOSTS ?? '') =>
  new Set(value.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));

export class BlockedDestinationError extends Error {}

// Throws unless `url` is http(s) and every address it resolves to is public, or the host is allow-listed.
// Residual risk: DNS rebinding between this check and the fetch (tracked in OD-18).
export async function assertSafeDestination(url, { allowedHosts = new Set(), lookupImpl = lookup } = {}) {
  const { protocol, hostname } = new URL(url);
  if (protocol !== 'http:' && protocol !== 'https:') throw new BlockedDestinationError('protocol');
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (allowedHosts.has(host)) return;
  if (host.endsWith('.internal') || host === 'localhost') throw new BlockedDestinationError('host');
  const addresses = isIP(host) ? [{ address: host }] : await lookupImpl(host, { all: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new BlockedDestinationError('address');
  }
}
