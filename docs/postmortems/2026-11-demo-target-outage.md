# Postmortem: demo-target outage and duplicate incident risk

**Date:** 2026-11-05 · **Severity:** medium · **Status:** example. Replace with a real exercise once you've run the stack.

> **How to produce a real one:** `docker compose up`, then
> `curl -XPOST localhost:4000/chaos -d '{"latencyMs":4000}'` (worker timeout is 3s).
> Watch the incident open in the dashboard, restore it, then fill this in with the real timeline from
> `GET /incidents/:id`.

## Summary
demo-target started answering health checks in about 4s, above the 3s check timeout. OpsDeck opened an
incident within one check interval and auto-resolved it when latency recovered.

## Root cause
Chaos-injected latency (simulated slow dependency). **Systemic finding:** the incident was auto-resolved
without a human recording a root cause. The product rule that enforces a root cause only applies to
manual resolution.

## Action items
| Action | Type | Backlog ID |
|---|---|---|
| Open an incident only after N consecutive failures | prevent noise | OD-8 |
| Ask for a root cause on auto-resolved incidents above medium severity | learn | new: OD-16 |
| Notify the owner team when an incident opens | detect | OD-10 |
