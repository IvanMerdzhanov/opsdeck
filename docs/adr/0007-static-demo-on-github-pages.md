# ADR-0007: Public demo as a static site with an in-browser simulated backend

**Status:** Accepted · **Date:** 2026-11-05 · **Context from:** ADR-0004, 0005, 0006

## Context
We tried every free way to host the real backend:

| Host | Outcome |
|---|---|
| Fly.io | Card required to start machines (trial) |
| Render | Card required even for the $0 web service plan |
| Hugging Face Spaces | Docker Spaces need a PRO subscription (`402 Payment Required`) |

Constraint from the product owner: **$0 and no card.** The audience (recruiters, interviewers) mostly
wants to *see the product work* in one click; engineers who want the real thing can run one container.

## Decision
- Publish the **real dashboard** on GitHub Pages with `demo-backend.js`, which intercepts `/api/*` in the browser
  and simulates the services with the same rules (transition-only incidents, appending to open incidents,
  auto-resolve, MTTR and uptime from history).
- A permanent banner says it's a simulation and links to the source and the one-command real run.
- CI builds the site and publishes it only after **all** end-to-end suites pass against the real stack.

## Consequences
- ✅ $0, no card, no extra accounts, never sleeps, loads instantly.
- ✅ Honest: clearly labelled; the real system is one `docker run` away and tested in CI.
- ⚠️ It can't show real network checks, queues or persistence; those are proven by CI and the docs, not by the demo.
- ⚠️ The simulation reimplements some rules, so it can drift from the real code. Tracked as **OD-25**
  (share the pure modules with the browser build).
