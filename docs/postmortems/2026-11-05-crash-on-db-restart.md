# Postmortem: every service crashes when the database restarts

**Date:** 2026-11-05 · **Severity:** high (pre-production) · **Status:** final
**Blameless:** this document is about systems and processes, not people.

## Summary
During pre-launch resilience testing, stopping Postgres caused **registry-api, incident-api and
monitor-worker to all exit with code 1** within a second. Nothing restarted them, so the whole product stayed
down after the database came back. Found before the public launch; no users affected.

## How it was found
A manual test of the readiness probe: stop Postgres and expect `/ready` to return `503`.
Instead the connection was refused, because the process was gone.

## Timeline (UTC)
| Time | Event |
|---|---|
| 11:52 | `docker compose stop postgres` |
| 11:52 | All three Node services exit (`Unhandled 'error' event` on `BoundPool`) |
| 11:53 | Root cause identified from container logs |
| 11:58 | Fix verified: Postgres restarted, 0 service restarts, `/ready` back to 200, smoke test passes |

## Root cause (5 whys)
1. **Why did the services exit?** `pg.Pool` emitted an `error` event and Node treats an unhandled `error` event as fatal.
2. **Why was there an error event?** Postgres terminated the pool's *idle* connections on shutdown, and `pg` reports that on the pool, not on any query.
3. **Why was it unhandled?** The shared `createDb()` helper never attached a pool error listener.
4. **Why didn't tests catch it?** Unit tests use a fake DB; the e2e smoke test only covers the happy path with a stable database.
5. **Why did nothing recover?** The compose services had no restart policy; we relied on the platform (Fly restarts machines) and assumed local behaved the same.

## What went well / badly / lucky
- ✅ Structured logs made the cause obvious within a minute.
- ✅ One shared DB helper meant one fix covered all three services.
- ❌ Resilience was assumed, not tested.
- 🍀 Lucky: found before launch, not during a Fly host migration at 3 a.m.

## Action items
| Action | Type | Status |
|---|---|---|
| Handle `pool.on('error')` and `redis.on('error')` in the shared helpers | prevent | ✅ done |
| `restart: unless-stopped` on all app services in compose | mitigate | ✅ done |
| Add "restart Postgres mid-run" step to the e2e smoke test | detect | backlog: **OD-21** |
| Readiness probe no longer echoes dependency error text (security review finding) | prevent | ✅ done |
