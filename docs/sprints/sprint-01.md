# Sprint 1: "Know when it breaks"

**Sprint goal:** an engineer is told automatically, within 15 seconds, that a registered service went down.

| Committed | Done |
|---|---|
| OD-1 Register services | ✅ |
| OD-2 Latest status & latency | ✅ |
| OD-3 Auto-open incident | ✅ |
| OD-7 CI: lint + unit tests | ✅ (e2e moved to Sprint 2) |

## Review
Demoed breaking `demo-target` live: the incident opened in about 10s. Stakeholder feedback: *"I want to
check one service now, not wait for the next sweep."* That became **OD-5**.

## Retro
- **Keep:** writing ADRs before building; it made the queue choice quick.
- **Change:** the e2e test was squeezed out. Next sprint it's in the Definition of Done for anything touching the event flow.
- **Try:** RICE scoring in refinement, so the tech-debt vs feature trade-off is explicit.
