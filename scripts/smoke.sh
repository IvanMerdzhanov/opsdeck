#!/usr/bin/env bash
# End-to-end smoke test against a running stack (docker compose up).
# Breaks demo-target, expects an incident to open, heals it, expects auto-resolve.
set -euo pipefail

REGISTRY=${REGISTRY:-http://localhost:3001}
INCIDENTS=${INCIDENTS:-http://localhost:3002}
TARGET=${TARGET:-http://localhost:4000}

json() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const v=JSON.parse(d);console.log(eval(process.argv[1]))})" "$1"; }

wait_for() { # wait_for <description> <command>
  for _ in $(seq 1 30); do
    if eval "$2" >/dev/null 2>&1; then echo "✓ $1"; return 0; fi
    sleep 1
  done
  echo "✗ timed out: $1"; exit 1
}

reset() { curl -sf -XPOST "$TARGET/chaos" -d '{"healthy":true,"latencyMs":0}' >/dev/null || true; }
trap reset EXIT

code=$(curl -s -o /dev/null -w '%{http_code}' -XPOST "$REGISTRY/services" -H 'content-type: application/json' \
  -d '{"name":"intruder","url":"http://x","owner":"x"}')
[ "$code" = "401" ] && echo "✓ writes rejected without API key" || { echo "✗ expected 401, got $code"; exit 1; }

SERVICE_ID=$(curl -sf "$REGISTRY/services" | json "v.find(s => s.name === 'demo-target').id")
echo "demo-target id: $SERVICE_ID"

open_count() { curl -sf "$INCIDENTS/incidents?status=open" | json "v.filter(i => i.service_id === '$SERVICE_ID').length"; }

curl -sf -XPOST "$TARGET/chaos" -d '{"healthy":false}' >/dev/null
curl -sf -XPOST "$REGISTRY/services/$SERVICE_ID/diagnostics" >/dev/null
wait_for "incident opened for demo-target" '[ "$(open_count)" = "1" ]'

reset
curl -sf -XPOST "$REGISTRY/services/$SERVICE_ID/diagnostics" >/dev/null
wait_for "incident auto-resolved" '[ "$(open_count)" = "0" ]'

curl -sf "$INCIDENTS/metrics/summary"; echo
echo "smoke test passed"
