# Product backlog

Prioritisation: **RICE** = (Reach × Impact × Confidence) / Effort.
Reach = services or users affected per quarter (1–10), Impact 0.25–3, Confidence 50–100%, Effort in person-weeks.
Tech debt is ranked in the **same list** as features. It competes for the same capacity, so it gets the same scrutiny.

## Epics
- **E1 Service registry**: know what we run and who owns it
- **E2 Health monitoring**: detect failures automatically
- **E3 Incident management**: respond, record, learn
- **E4 Reporting**: make reliability measurable
- **E5 Platform & operability**: keep OpsDeck itself reliable and secure

## Done (Sprint 1–2)
| ID | Story | Epic |
|---|---|---|
| OD-1 | As an engineer I can register a service with owner, URL and environment | E1 |
| OD-2 | As an engineer I see each service's latest status and latency | E2 |
| OD-3 | As an engineer I get an incident opened automatically when a service goes down | E3 |
| OD-4 | Incidents auto-resolve when the service recovers | E3 |
| OD-5 | As an engineer I can trigger a check on demand ("Check now") | E2 |
| OD-6 | As a lead I see MTTR (30d) and 24h uptime per service | E4 |
| OD-7 | CI pipeline: lint, unit tests, e2e smoke test, image publishing | E5 |
| OD-9 | **Authentication** for write endpoints: admin API key; APIs internal-only behind the dashboard proxy | E5 |
| OD-18 | SSRF guard: http(s) only, no redirects, private/link-local/metadata ranges blocked unless allow-listed, generic error codes; addresses validated at connect time (DNS-rebinding safe) | E5 |
| OD-20 | Public live demo on Fly.io with continuous deployment from `main` | E5 |

## Ready / prioritised
| Rank | ID | Item | Type | R | I | C | E | RICE |
|---|---|---|---|---|---|---|---|---|
| 1 | OD-8 | **Failure threshold**: open an incident only after N consecutive failed checks (stop flapping noise) | Feature | 10 | 2 | 90% | 1 | **18.0** |
| 3 | OD-10 | **Slack/Teams notification** on incident open/resolve | Feature | 8 | 2 | 80% | 1 | **12.8** |
| 4 | OD-11 | **Race condition**: two concurrent checks of one service can both read the same previous status and emit duplicate events | Debt | 10 | 1 | 80% | 1 | **8.0** |
| 5 | OD-12 | **Check retention**: delete or roll up checks older than 30 days (table grows ~8.6k rows/service/day at 10s) | Debt | 10 | 1 | 100% | 1.5 | **6.7** |
| 6 | OD-13 | Incident detail page with timeline and notes in the dashboard | Feature | 6 | 1 | 100% | 1 | **6.0** |
| 7 | OD-14 | Split the incident consumer into its own deployable (see ADR-0003) | Debt | 3 | 1 | 70% | 1 | **2.1** |
| 2 | OD-17 | **Database backups**: nightly `pg_dump` to object storage + a tested restore (the Fly DB is a single node on one volume) | Debt / ops | 10 | 3 | 90% | 1 | **27.0** → do next |
| 10 | OD-19 | Per-user identity (GitHub/SSO) instead of one shared key, so the incident timeline shows real authors | Feature | 6 | 1 | 80% | 3 | **1.6** |
| 3 | OD-21 | **Chaos step in e2e**: restart Postgres and Redis mid-run and assert services recover (from the [crash-on-DB-restart postmortem](postmortems/2026-11-05-crash-on-db-restart.md)) | Debt / reliability | 10 | 2 | 90% | 0.5 | **36.0** |
| 8 | OD-15 | Per-service check interval and custom expected status | Feature | 4 | 0.5 | 80% | 1 | **1.6** |

### Example story with acceptance criteria. OD-8, failure threshold
> As a **service engineer**, I want an incident opened only after a service fails **3 consecutive checks**,
> so that **a single network blip doesn't page my team**.

**Acceptance criteria**
- Given a service that is `up`, when 1 or 2 consecutive checks fail, then no incident is opened and the dashboard shows it as `degraded`.
- Given 3 consecutive failures, then exactly one incident opens and its timeline lists all 3 failures.
- Threshold is configurable per environment (default: dev=1, prod=3).
- Recovery still requires only 1 successful check.
- Unit tests cover the transition logic; the e2e smoke test still passes.

**Why rank 1:** in Sprint 2 the `example-dot-com` service opened 4 incidents in a week from timeouts under 1 second.
That's noise that teaches people to ignore OpsDeck, which is the biggest risk to adoption.
