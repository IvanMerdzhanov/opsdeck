import dns from 'node:dns';
import { lookup } from 'node:dns/promises';
import { Agent, fetch as undiciFetch } from 'undici';
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

// Allow-list entries are exact origins, "host:port" (e.g. "demo-target:4000"). Matching on host alone
// would let a registered URL reach any other port on that host, such as Redis or Postgres on loopback.
export const allowedHostsFromEnv = (value = process.env.ALLOWED_INTERNAL_HOSTS ?? '') =>
  new Set(value.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));

const DEFAULT_PORTS = { 'http:': '80', 'https:': '443' };
const originOf = ({ protocol, hostname, port }) =>
  `${hostname.replace(/^\[|\]$/g, '').toLowerCase()}:${port || DEFAULT_PORTS[protocol]}`;
const hostsOf = (allowedOrigins) => new Set([...allowedOrigins].map((o) => o.slice(0, o.lastIndexOf(':'))));

export class BlockedDestinationError extends Error {}

// Fast pre-flight check: http(s) only, and every resolved address public (or host allow-listed).
// Enforcement against DNS rebinding happens in guardedLookup, at connect time.
export async function assertSafeDestination(url, { allowedHosts = new Set(), lookupImpl = lookup } = {}) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new BlockedDestinationError('protocol');
  if (allowedHosts.has(originOf(parsed))) return;
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host.endsWith('.internal') || host === 'localhost') throw new BlockedDestinationError('host');
  const addresses = isIP(host) ? [{ address: host }] : await lookupImpl(host, { all: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new BlockedDestinationError('address');
  }
}

// DNS lookup used for the actual TCP connection. It only sees hostnames; ports are enforced by
// assertSafeDestination on the same URL (redirects are never followed, so the URL can't change). It validates the very addresses the socket will
// connect to, so a hostname can't pass the pre-check with a public IP, then connect to a private one.
// (IP-literal URLs skip DNS entirely and are fully covered by assertSafeDestination.)
export function createGuardedLookup({ allowedHosts = new Set(), dnsLookup = dns.lookup } = {}) {
  const allowedHostnames = hostsOf(allowedHosts);
  return (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err);
      const allowed = allowedHostnames.has(hostname.toLowerCase());
      if (!allowed && (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address)))) {
        return callback(new BlockedDestinationError('address'));
      }
      if (options?.all) return callback(null, addresses);
      callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

// fetch bound to a connection pool that only ever connects through guardedLookup.
export function createGuardedFetch({ allowedHosts, dnsLookup } = {}) {
  const dispatcher = new Agent({ connect: { lookup: createGuardedLookup({ allowedHosts, dnsLookup }) } });
  return (url, options) => undiciFetch(url, { ...options, dispatcher });
}
