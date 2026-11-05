# ADR-0001: Three services in one monorepo (npm workspaces)

**Status:** Accepted · **Date:** 2026-11-05

## Context
OpsDeck has three different workloads: a request/response CRUD API (registry), a scheduled
outbound-HTTP workload (monitor) and an event-driven workflow (incidents). They scale and fail differently.
The monitor can be slow or blocked by bad targets, and that must never slow down the API.

## Decision
- Split into `registry-api`, `monitor-worker`, `incident-api`, communicating **only via queues and the DB**.
- Keep them in **one repo** with npm workspaces and a `@opsdeck/shared` package (logging, DB, probes, error handling).
- One Dockerfile with a `SERVICE` build arg.

## Consequences
- ✅ Monitor load can't take down the API; each service can be scaled separately.
- ✅ One PR can change a contract and all its consumers together; one CI pipeline.
- ⚠️ Shared DB = shared schema coupling. Acceptable at this size; revisit if teams split ownership.
- ⚠️ Shared package changes redeploy all services.
