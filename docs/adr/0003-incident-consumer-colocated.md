# ADR-0003: Incident event consumer runs inside incident-api (for now)

**Status:** Accepted · **Date:** 2026-11-05

## Context
The consumer that turns events into incidents could be its own deployable.

## Decision
Run it in the same process as the incident HTTP API, with `concurrency: 1`.

## Consequences
- ✅ One less thing to deploy and monitor; consumer and API share the same domain code.
- ✅ `concurrency: 1` plus the partial unique index (`incidents_one_active_per_service`) prevents duplicate active incidents.
- ⚠️ A consumer crash restarts the API too. Tracked as **OD-14**, to split it out when event volume or team size justifies it.
