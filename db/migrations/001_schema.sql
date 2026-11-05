CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE services (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  url         text NOT NULL,
  owner       text NOT NULL,
  environment text NOT NULL DEFAULT 'dev' CHECK (environment IN ('dev', 'staging', 'prod')),
  version     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE checks (
  id          bigserial PRIMARY KEY,
  service_id  uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  status      text NOT NULL CHECK (status IN ('up', 'down')),
  status_code integer,
  latency_ms  integer,
  error       text,
  checked_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checks_service_time_idx ON checks (service_id, checked_at DESC);

CREATE TABLE incidents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id  uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  title       text NOT NULL,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved')),
  severity    text NOT NULL DEFAULT 'high' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  assignee    text,
  root_cause  text,
  opened_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
-- At most one unresolved incident per service.
CREATE UNIQUE INDEX incidents_one_active_per_service ON incidents (service_id) WHERE status <> 'resolved';

CREATE TABLE incident_events (
  id          bigserial PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  type        text NOT NULL,
  message     text NOT NULL,
  author      text NOT NULL DEFAULT 'system',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX incident_events_incident_idx ON incident_events (incident_id, created_at);
