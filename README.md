# OpsDeck

An internal **service toolchain**: register the services your team owns, monitor their health
automatically, get incidents opened and resolved on state changes, and track MTTR and uptime.

**Live demo:** https://ivanmerdzhanov.github.io/opsdeck/. Press **Break demo-target** and watch it happen.
The live demo runs the real dashboard against a simulated backend in your browser (free static hosting).
The real stack runs with one command: see [Deploy](#deploy).

Built as a portfolio project for **technical product ownership**. The code is half of it;
the [product docs](#product-docs) show how it is prioritised, decided and operated.

## Architecture

```
            ┌────────────┐   POST /services/:id/diagnostics
 Dashboard ─┤ registry-api├──────────────┐
 (nginx)    └─────┬──────┘               ▼
     │            │            ┌──────────────────┐  fetch   ┌──────────────┐
     │            │            │  "checks" queue  ├────────▶ │ monitored    │
     │            │            │ (BullMQ / Redis) │          │ services     │
     │            │            └────────┬─────────┘          └──────────────┘
     │            │                     ▼
     │            │            ┌──────────────────┐ service.failed / recovered
     │            │            │  monitor-worker  ├──────────────┐
     │            │            └────────┬─────────┘              ▼
     │            ▼                     ▼               ┌──────────────────┐
     │      ┌───────────────────────────────────┐       │  "events" queue  │
     │      │            PostgreSQL             │◀──────┤                  │
     │      │ services · checks · incidents     │       └────────┬─────────┘
     │      └───────────────────────────────────┘                ▼
     └──────────────────────────────────────────────▶   incident-api (HTTP + consumer)
```

| Service | Port | Responsibility |
|---|---|---|
| `registry-api` | 3001 | Service CRUD, check history, on-demand diagnostics |
| `monitor-worker` | (none) | Scheduled sweep, HTTP health checks, emits state-change events |
| `incident-api` | 3002 | Consumes events into incidents, incident workflow, metrics |
| `demo-target` | 4000 | A breakable service for demos (`POST /chaos`) |
| `dashboard` | 8080 | Static UI (nginx proxies `/api/*`) |
| `all-in-one` | 10000 | All of the above in one process, for single-service free hosting |

**Stack:** Node.js 22, Express 5, BullMQ, PostgreSQL 16, Redis 7, Zod, Pino, Vitest, Docker, GitHub Actions.

## Run it

```bash
npm install
docker compose up --build          # dashboard → http://localhost:8080
```

Break something and watch it get handled:

```bash
curl -XPOST localhost:4000/chaos -d '{"healthy":false}'   # incident opens within ~10s
curl -XPOST localhost:4000/chaos -d '{"healthy":true}'    # incident auto-resolves
```

Resolve an incident manually (a root cause is required):

```bash
curl -XPATCH localhost:3002/incidents/<id> -H 'content-type: application/json' \
  -d '{"status":"resolved","root_cause":"Connection pool exhausted after deploy","author":"ivan"}'
```

## Security model

- **One public entrypoint.** In the microservice deploy that's the nginx dashboard (APIs, DB and Redis stay private). In the all-in-one deploy the demo target listens on loopback only.
- **Reads are public; writes need an admin API key** (`x-api-key`, constant-time compare). With no key configured, writes are disabled, not open.
- Public demo actions (breaking demo-target, running a check) are **rate-limited** at the proxy.
- The monitor **won't call private, loopback, link-local or metadata addresses**, doesn't follow redirects, validates addresses at connect time (so DNS rebinding can't bypass it), and stores only generic error codes (except allow-listed hosts like demo-target).
- Known gaps, prioritised in the backlog: DB backups (OD-17), per-user identity (OD-19).

## Deploy

**Live demo (GitHub Pages, free):** the real dashboard plus `services/dashboard/demo-backend.js`, an in-browser
simulation of the APIs that follows the same rules (transition-only incidents, auto-resolve, MTTR and uptime from history).
CI publishes it from `main` after all end-to-end suites pass ([ADR-0007](docs/adr/0007-static-demo-on-github-pages.md)).

**Full stack in one container** (Postgres and Redis bundled, fresh data each boot; [ADR-0006](docs/adr/0006-bundled-ephemeral-demo-stores.md)).
It runs on any Docker host:

```bash
docker build -f deploy/demo-bundled.Dockerfile -t opsdeck-demo .
docker run -p 10000:10000 -e ADMIN_API_KEY=local-dev-admin-key opsdeck-demo   # → http://localhost:10000
```

**With managed databases:** `deploy/all-in-one.Dockerfile` + `DATABASE_URL` / `REDIS_URL` (e.g. Neon + Upstash).

**Production-like (paid):** each service as its own app on Fly.io, private networking, one public proxy.
`FLY_APP_PREFIX=opsdeck-<you> scripts/fly-deploy.sh`. See [ADR-0004](docs/adr/0004-hosting-on-fly.md).

## Test

```bash
npm test             # unit tests (no Docker needed)
npm run lint
npm run smoke        # end-to-end: needs the compose stack running
```

CI (`.github/workflows/ci.yml`): lint and unit tests, then an **e2e smoke test against the full
compose stack**, then image publishing to GHCR on `main`.

## Product docs

| Doc | What it shows |
|---|---|
| [Vision](docs/VISION.md) | Problem, personas, success metrics, non-goals |
| [Backlog](docs/BACKLOG.md) | Epics, RICE-ranked features **and tech debt**, a story with acceptance criteria |
| [ADRs](docs/adr) | Service split, BullMQ vs Kafka, consumer placement |
| [Sprint 1](docs/sprints/sprint-01.md) | Sprint goal, review feedback → new story, retro |
| [Postmortem](docs/postmortems) | Blameless template and an example |
| [Definition of Done](docs/DEFINITION_OF_DONE.md) | Quality gates |
| [OpenAPI](docs/openapi.yaml) | API contract |

## Known limitations (tracked in the backlog)
No auth yet (OD-9) · single-failure incidents can be noisy (OD-8) · possible duplicate events under
concurrent checks of one service (OD-11) · no check data retention (OD-12).
