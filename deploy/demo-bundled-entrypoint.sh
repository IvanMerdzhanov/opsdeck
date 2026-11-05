#!/bin/sh
# Starts throwaway Postgres + Redis on loopback, then runs OpsDeck as the unprivileged node user.
# Least privilege even inside the container: nothing runs as root after boot, the app's DB role is not a
# superuser, and both stores require per-boot random passwords.
set -eu

secret() { tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32; }
PG_PASSWORD=$(secret)
REDIS_PASSWORD=$(secret)

PGDATA=/var/lib/postgresql/data
mkdir -p "$PGDATA" /run/postgresql
chown -R postgres:postgres /var/lib/postgresql /run/postgresql

# Superuser "postgres" is reachable only via the local socket (peer-style trust for bootstrap);
# TCP connections require scram-sha-256.
su-exec postgres initdb -D "$PGDATA" --username=postgres --auth-local=trust --auth-host=scram-sha-256 \
  --encoding=UTF8 >/dev/null
# Durability settings are off on purpose: the data is disposable and this keeps a 0.1 CPU instance fast.
su-exec postgres pg_ctl -D "$PGDATA" -w -l /tmp/postgres.log start -o \
  "-c listen_addresses=127.0.0.1 -c max_connections=30 -c shared_buffers=32MB \
   -c fsync=off -c synchronous_commit=off -c full_page_writes=off" >/dev/null
su-exec postgres psql -q -v ON_ERROR_STOP=1 -v pw="$PG_PASSWORD" -d postgres <<'SQL'
CREATE ROLE opsdeck LOGIN PASSWORD :'pw' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE opsdeck OWNER opsdeck;
SQL

# Redis as its own user, password required, admin commands disabled.
mkdir -p /run/redis && chown redis:redis /run/redis
printf 'requirepass %s\n' "$REDIS_PASSWORD" > /run/redis/auth.conf
chown redis:redis /run/redis/auth.conf && chmod 600 /run/redis/auth.conf
su-exec redis redis-server /run/redis/auth.conf --bind 127.0.0.1 --port 6379 --save '' --appendonly no \
  --maxmemory-policy noeviction --daemonize yes --logfile /tmp/redis.log --dir /run/redis \
  --rename-command CONFIG "" --rename-command DEBUG "" --rename-command MODULE "" --rename-command SLAVEOF "" \
  --rename-command REPLICAOF ""

export DATABASE_URL="postgres://opsdeck:$PG_PASSWORD@127.0.0.1:5432/opsdeck"
export REDIS_URL="redis://:$REDIS_PASSWORD@127.0.0.1:6379"
unset PG_PASSWORD REDIS_PASSWORD
echo "bundled postgres + redis ready"

exec su-exec node node services/all-in-one/src/server.js
