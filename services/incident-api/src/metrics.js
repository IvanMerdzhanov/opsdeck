// Mean time to recovery, in minutes, across resolved incidents.
export function computeMttrMinutes(incidents) {
  const resolved = incidents.filter((i) => i.resolved_at);
  if (resolved.length === 0) return null;
  const totalMs = resolved.reduce((sum, i) => sum + (new Date(i.resolved_at) - new Date(i.opened_at)), 0);
  return Math.round((totalMs / resolved.length / 60000) * 10) / 10;
}

export function uptimePercent(upCount, totalCount) {
  if (!totalCount) return null;
  return Math.round((upCount / totalCount) * 10000) / 100;
}
