import { describe, expect, it } from 'vitest';
import { EVENTS } from '@opsdeck/shared';
import { detectTransition } from '../src/state.js';

describe('detectTransition', () => {
  it.each([
    [undefined, 'up', null],
    [undefined, 'down', EVENTS.SERVICE_FAILED],
    ['up', 'up', null],
    ['up', 'down', EVENTS.SERVICE_FAILED],
    ['down', 'down', null],
    ['down', 'up', EVENTS.SERVICE_RECOVERED],
  ])('%s -> %s emits %s', (prev, curr, expected) => {
    expect(detectTransition(prev, curr)).toBe(expected);
  });
});
