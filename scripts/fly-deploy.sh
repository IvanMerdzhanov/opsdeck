#!/usr/bin/env bash
# Deploys OpsDeck to Fly.io as 7 small apps that talk over Fly's private network (6PN).
#
#   FLY_APP_PREFIX=opsdeck-ivan scripts/fly-deploy.sh            # first run: infra + secrets + apps
#   FLY_APP_PREFIX=opsdeck-ivan scripts/fly-deploy.sh --apps-only  # redeploy code only
#
# Only <prefix>-web is public. Generated secrets are kept in .fly-secrets (git-ignored, chmod 600)
# so reruns reuse them.
set -euo pipefail

P=${FLY_APP_PREFIX:?set FLY_APP_PREFIX, e.g. opsdeck-ivan (must be globally unique on Fly)}
REGION=${FLY_REGION:-fra}
ORG=${FLY_ORG:-personal}
APPS_ONLY=false
[[ "${1:-}" == "--apps-only" ]] && APPS_ONLY=true

cd "$(dirname "$0")/.."
FLY=$(command -v fly || command -v flyctl) || { echo "flyctl not installed: brew install flyctl"; exit 1; }
log() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

deploy() { # deploy <name> <config> [extra fly deploy args...]
  local name=$1 config=$2; shift 2
  log "deploying $P-$name"
  "$FLY" deploy . --config "fly/$config.toml" --app "$P-$name" --primary-region "$REGION" \
    --remote-only --ha=false --yes "$@"
}

if ! $APPS_ONLY; then
  log "ensuring apps exist"
  for app in db redis demo registry incidents worker web; do
    "$FLY" status --app "$P-$app" >/dev/null 2>&1 || "$FLY" apps create "$P-$app" --org "$ORG"
  done

  log "ensuring database volume"
  "$FLY" volumes list --app "$P-db" 2>/dev/null | grep -q pgdata \
    || "$FLY" volumes create pgdata --app "$P-db" --region "$REGION" --size 1 --yes

  log "secrets"
  if [[ ! -f .fly-secrets ]]; then
    umask 077
    {
      echo "PG_PASSWORD=$(openssl rand -hex 24)"
      echo "REDIS_PASSWORD=$(openssl rand -hex 24)"
      echo "ADMIN_API_KEY=$(openssl rand -hex 24)"
    } > .fly-secrets
    echo "generated .fly-secrets"
  fi
  # shellcheck disable=SC1091
  source .fly-secrets
  DATABASE_URL="postgres://opsdeck:$PG_PASSWORD@$P-db.internal:5432/opsdeck"
  REDIS_URL="redis://:$REDIS_PASSWORD@$P-redis.internal:6379?family=6"

  "$FLY" secrets set --stage --app "$P-db" POSTGRES_PASSWORD="$PG_PASSWORD" >/dev/null
  "$FLY" secrets set --stage --app "$P-redis" REDIS_PASSWORD="$REDIS_PASSWORD" >/dev/null
  for app in registry incidents worker; do
    "$FLY" secrets set --stage --app "$P-$app" DATABASE_URL="$DATABASE_URL" REDIS_URL="$REDIS_URL" >/dev/null
  done
  for app in registry incidents; do
    "$FLY" secrets set --stage --app "$P-$app" ADMIN_API_KEY="$ADMIN_API_KEY" >/dev/null
  done

  deploy db db
  deploy redis redis --dockerfile fly/redis.Dockerfile
fi

deploy demo demo --dockerfile Dockerfile --build-arg SERVICE=demo-target
deploy registry registry --dockerfile Dockerfile --build-arg SERVICE=registry-api \
  --env DEMO_TARGET_URL="http://$P-demo.internal:4000/health"
deploy incidents incidents --dockerfile Dockerfile --build-arg SERVICE=incident-api
deploy worker worker --dockerfile Dockerfile --build-arg SERVICE=monitor-worker \
  --env ALLOWED_INTERNAL_HOSTS="$P-demo.internal"
deploy web web --dockerfile services/dashboard/Dockerfile \
  --env REGISTRY_UPSTREAM="http://$P-registry.internal:3001" \
  --env INCIDENTS_UPSTREAM="http://$P-incidents.internal:3002" \
  --env DEMO_UPSTREAM="http://$P-demo.internal:4000"

log "done → https://$P-web.fly.dev"
$APPS_ONLY || echo "Admin API key is in .fly-secrets (ADMIN_API_KEY). Paste it into the dashboard's Admin box."
