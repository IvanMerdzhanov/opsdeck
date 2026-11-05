import { createHash, timingSafeEqual } from 'node:crypto';
import { HttpError } from './http.js';

const digest = (value) => createHash('sha256').update(value).digest();

// Guards write endpoints with a shared admin key sent as `x-api-key`.
// If no key is configured, writes are disabled rather than left open.
export function requireApiKey(expected) {
  return (req, _res, next) => {
    if (!expected) return next(new HttpError(503, 'writes_disabled'));
    const provided = req.get('x-api-key') ?? '';
    // Hash both sides so the comparison is constant-time regardless of length.
    if (!timingSafeEqual(digest(provided), digest(expected))) {
      return next(new HttpError(401, 'invalid_api_key'));
    }
    next();
  };
}
