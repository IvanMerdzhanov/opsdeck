# ADR-0005: Free public demo as one service (Render + Neon + Upstash)

**Status:** Accepted · **Date:** 2026-11-05 · **Supersedes (for the demo):** ADR-0004

## Context
The Fly.io plan (ADR-0004) costs about $12–15 a month. The demo's audience is a handful of recruiters
and interviewers, which doesn't justify any monthly cost. Free tiers that need no card give us **one**
web service that sleeps when idle, plus external free Postgres and Redis.

## Decision
- Add `services/all-in-one`, a composition root that starts the **same modules** (registry app, incident app
  and consumer, monitor, demo target, dashboard) in one process. No business logic is duplicated.
- Host it on **Render free** (Docker), with **Neon** (Postgres) and **Upstash** (Redis).
- Keep the microservice deploy (compose, Fly configs) as the reference topology. CI tests **both** builds end to end.

## Consequences
- ✅ $0 a month, no card. The architecture boundaries still exist in code; only the deployment unit changed.
  This is a deliberate *modular monolith deploy*, a common real-world trade-off.
- ✅ Render deploys only after GitHub checks pass (`autoDeployTrigger: checksPass`).
- ⚠️ **Sleeps after 15 min without HTTP traffic:** a ~30–50s cold start, and **no monitoring while asleep**.
  Acceptable for a demo, unacceptable for a real monitoring tool. Tracked as **OD-22** (measure, then decide).
- ⚠️ **Upstash bills per command.** Idle BullMQ workers poll Redis; the all-in-one sets `drainDelay: 30s` and
  `stalledInterval: 5min` and checks every 30s, to stay inside the free monthly quota while awake.
- ⚠️ No process isolation: a crash in the monitor restarts the API too. Mitigated by the error handling added
  after the [crash-on-DB-restart postmortem](../postmortems/2026-11-05-crash-on-db-restart.md).
