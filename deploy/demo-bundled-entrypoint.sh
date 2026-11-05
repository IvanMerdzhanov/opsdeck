#!/bin/sh
# Starts throwaway Postgres + Redis on loopback, then runs OpsDeck.
#
# Two modes:
#  - started as root (Render, docker run): Postgres, Redis and the app each run as their own OS user.
#  - started as non-root (Hugging Face Spaces runs containers as uid 1000): everything runs as that
#    user, with state under /tmp. Process isolation between stores and app isn't possible then; the
#    per-boot passwords and loopback-only listeners still apply. See ADR-0006.
#
# No trust auth anywhere: the superuser and the app role both use per-boot scram-sha-256 passwords,
# Postgres has no Unix socket, and the app role is not a superuser.
set -eu

secret() { tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32; }
SUPER_PASSWORD=$(secret)
APP_PASSWORD=$(secret)
REDIS_PASSWORD=$(secret)

if [ "$(id -u)" = 0 ]; then
  AS_PG="su-exec postgres"; AS_REDIS="su-exec redis"; AS_APP="su-exec node"
  BASE=/var/lib/opsdeck
  mkdir -p "$BASE/pg" "$BASE/pgdata" "$BASE/redis"
  chown -R postgres:postgres "$BASE/pg" "$BASE/pgdata"
  chown redis:redis "$BASE/redis"
else
  AS_PG=""; AS_REDIS=""; AS_APP=""
  BASE=/tmp/opsdeck
  mkdir -p "$BASE/pg" "$BASE/pgdata" "$BASE/redis"
fi
chmod 700 "$BASE/pg" "$BASE/pgdata" "$BASE/redis"

# --- Postgres -------------------------------------------------------------------------------
PWFILE="$BASE/pg/superuser.pw"
printf '%s\n' "$SUPER_PASSWORD" > "$PWFILE"
[ -n "$AS_PG" ] && chown postgres:postgres "$PWFILE"
$AS_PG initdb -D "$BASE/pgdata" --username=postgres --auth=scram-sha-256 --pwfile="$PWFILE" \
  --encoding=UTF8 >/dev/null
rm -f "$PWFILE"
# Durability is off on purpose: the data is disposable and this keeps a small CPU share fast.
$AS_PG pg_ctl -D "$BASE/pgdata" -w -l "$BASE/pg/postgres.log" start -o \
  "-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -c max_connections=30 \
   -c shared_buffers=32MB -c fsync=off -c synchronous_commit=off -c full_page_writes=off" >/dev/null
PGPASSWORD="$SUPER_PASSWORD" $AS_PG psql -h 127.0.0.1 -U postgres -d postgres -q -v ON_ERROR_STOP=1 \
  -v pw="$APP_PASSWORD" <<'SQL'
CREATE ROLE opsdeck LOGIN PASSWORD :'pw' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE opsdeck OWNER opsdeck;
SQL

# --- Redis ----------------------------------------------------------------------------------
printf 'requirepass %s\n' "$REDIS_PASSWORD" > "$BASE/redis/auth.conf"
[ -n "$AS_REDIS" ] && chown redis:redis "$BASE/redis/auth.conf"
chmod 600 "$BASE/redis/auth.conf"
$AS_REDIS redis-server "$BASE/redis/auth.conf" --bind 127.0.0.1 --port 6379 --save '' --appendonly no \
  --maxmemory-policy noeviction --daemonize yes --logfile "$BASE/redis/redis.log" --dir "$BASE/redis" \
  --rename-command CONFIG "" --rename-command DEBUG "" --rename-command MODULE "" \
  --rename-command SLAVEOF "" --rename-command REPLICAOF ""

# --- App ------------------------------------------------------------------------------------
export DATABASE_URL="postgres://opsdeck:$APP_PASSWORD@127.0.0.1:5432/opsdeck"
export REDIS_URL="redis://:$REDIS_PASSWORD@127.0.0.1:6379"
unset SUPER_PASSWORD APP_PASSWORD REDIS_PASSWORD PGPASSWORD
echo "bundled postgres + redis ready ($( [ -n "$AS_APP" ] && echo 'separate users' || echo "single user uid $(id -u)"))"

exec $AS_APP node services/all-in-one/src/server.js
