# Product vision: OpsDeck

## Problem
Service engineers find out that an internal service is down from a user complaint, not from a tool.
When they do react, the context is scattered: the health status is in one place, the discussion in chat
and the root cause in someone's head. Nobody can say how long recovery usually takes.

## Vision
**One place where a service team sees the health of everything it owns, gets an incident opened
automatically when something breaks, and captures the root cause so it doesn't break the same way twice.**

## Target users (personas)
| Persona | Needs | Today's pain |
|---|---|---|
| **Service engineer (Maria)** | Know about failures first; run a diagnostic without SSH | Learns about outages from users |
| **Team lead (Georgi)** | See reliability trends; make sure incidents are closed properly | No MTTR data; postmortems skipped |
| **Platform owner (me, the PO)** | Prioritise reliability work with data | Tech-debt arguments are opinions, not numbers |

## Success metrics
- **Time to detect** < 1 check interval (target: 15s) for 100% of registered services
- **MTTR** visible to everyone and trending down quarter over quarter
- **≥ 90%** of manually resolved incidents have a recorded root cause (enforced by product rule)
- Adoption: **all prod services** in the registry within one quarter of launch

## Non-goals (for now)
- Replacing a full APM or observability stack (Datadog, Grafana)
- Paging and on-call scheduling; we integrate with these later, we don't build them
- Multi-tenant SaaS; this is an internal tool
