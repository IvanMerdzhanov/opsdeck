# ADR-0004: Host the public demo on Fly.io, one app per service, private networking

**Status:** Superseded for the public demo by [ADR-0005](0005-free-single-service-hosting.md) · **Date:** 2026-11-05

> Kept as the reference production topology. `fly/` and `scripts/fly-deploy.sh` still work with a paid Fly account.

## Context
OpsDeck needs a public URL that a recruiter can open and use, while keeping the real architecture
(separate services, queue, database) instead of collapsing it into one container for convenience.
Budget: about the price of a coffee per month.

## Options
| | Fly.io | Render | VPS + compose |
|---|---|---|---|
| Runs our Docker images unchanged | ✅ | ✅ | ✅ |
| Private networking between services | ✅ 6PN, `<app>.internal` | ✅ (paid) | ✅ docker network |
| Always-on background worker | ✅ ~$2/mo | Paid tier | ✅ |
| Ops burden (TLS, restarts, deploys) | Low | Lowest | Highest |

## Decision
Fly.io, as **7 apps**: `web` (only public app), `registry`, `incidents`, `worker`, `demo`, `db`, `redis`.
Postgres and Redis run as **self-managed containers** on Fly (Postgres on a 1 GB volume),
not managed services, to keep cost predictable.

## Consequences
- ✅ Production matches the local compose topology, so the same e2e test means the same thing.
- ✅ Attack surface is one nginx; everything else is unreachable from the internet.
- ✅ Schema migrations run as a Fly `release_command`, so a failed migration aborts the deploy.
- ⚠️ **Cost:** about $12–15/month (6 always-on 256 MB machines plus a 512 MB DB; `web` auto-stops when idle).
- ⚠️ **Single-node Postgres, no automated backups.** Fine for a demo, unacceptable for real data → **OD-17**.
- ⚠️ Redis has no persistence; in-flight jobs are lost on restart. Acceptable because checks are re-scheduled every 15s.
