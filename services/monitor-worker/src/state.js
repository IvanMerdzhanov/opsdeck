import { EVENTS } from '@opsdeck/shared';

// Emits an event only when a service changes state, not on every check.
export function detectTransition(previous, current) {
  if (current === 'down' && previous !== 'down') return EVENTS.SERVICE_FAILED;
  if (current === 'up' && previous === 'down') return EVENTS.SERVICE_RECOVERED;
  return null;
}
