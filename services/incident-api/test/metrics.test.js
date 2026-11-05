import { describe, expect, it } from 'vitest';
import { computeMttrMinutes, uptimePercent } from '../src/metrics.js';

describe('computeMttrMinutes', () => {
  it('returns null when nothing is resolved', () => {
    expect(computeMttrMinutes([{ opened_at: '2026-01-01T00:00:00Z', resolved_at: null }])).toBeNull();
  });

  it('averages resolved incidents only', () => {
    expect(
      computeMttrMinutes([
        { opened_at: '2026-01-01T00:00:00Z', resolved_at: '2026-01-01T00:10:00Z' },
        { opened_at: '2026-01-01T00:00:00Z', resolved_at: '2026-01-01T00:30:00Z' },
        { opened_at: '2026-01-01T00:00:00Z', resolved_at: null },
      ]),
    ).toBe(20);
  });
});

describe('uptimePercent', () => {
  it('handles empty windows and rounds to 2dp', () => {
    expect(uptimePercent(0, 0)).toBeNull();
    expect(uptimePercent(2, 3)).toBe(66.67);
  });
});
