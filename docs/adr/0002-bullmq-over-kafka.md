# ADR-0002: BullMQ on Redis for jobs and events (not Kafka or RabbitMQ)

**Status:** Accepted · **Date:** 2026-11-05

## Context
We need (a) recurring scheduled checks, (b) on-demand jobs, (c) reliable delivery of
`service.failed` / `service.recovered` events with retries.

## Options
| | BullMQ (Redis) | RabbitMQ | Kafka |
|---|---|---|---|
| Scheduling / repeatable jobs | Built in | Plugin / DIY | DIY |
| Retries with backoff | Built in | Manual DLX setup | Manual |
| Ops cost | One Redis | Broker cluster | Cluster + ops expertise |
| Event replay / history | ❌ | ❌ | ✅ |
| Node.js ergonomics | Excellent | Good | OK |

## Decision
BullMQ. Volume is tiny (hundreds of events a day), and scheduling plus retries are most of what we need.

## Consequences
- ✅ One extra dependency (Redis), which is also useful as a cache later.
- ⚠️ No event log or replay. If we need audit-grade history or multiple independent consumers,
  revisit (Redis Streams first, then Kafka).
- ⚠️ Delivery is at-least-once, so consumers must be idempotent (see `incident-api/src/consumer.js`).
