#!/bin/sh
# Starts throwaway Postgres + Redis on loopback, then runs OpsDeck as the unprivileged node user.
set -eu

PGDATA=/var/lib/postgresql/data
mkdir -p "$PGDATA" /run/postgresql
chown -R postgres:postgres /var/lib/postgresql /run/postgresql

# Trust auth is acceptable only because Postgres listens on 127.0.0.1 inside this container.
su-exec postgres initdb -D "$PGDATA" --username=opsdeck --auth=trust --encoding=UTF8 >/dev/null
# Durability settings are off on purpose: the data is disposable and this keeps a 0.1 CPU instance fast.
su-exec postgres pg_ctl -D "$PGDATA" -w -l /tmp/postgres.log start -o \
  "-c listen_addresses=127.0.0.1 -c max_connections=30 -c shared_buffers=32MB \
   -c fsync=off -c synchronous_commit=off -c full_page_writes=off" >/dev/null
su-exec postgres createdb -h 127.0.0.1 -U opsdeck opsdeck

redis-server --bind 127.0.0.1 --port 6379 --save '' --appendonly no \
  --maxmemory-policy noeviction --daemonize yes --logfile /tmp/redis.log

export DATABASE_URL="postgres://opsdeck@127.0.0.1:5432/opsdeck"
export REDIS_URL="redis://127.0.0.1:6379"
echo "bundled postgres + redis ready"

exec su-exec node node services/all-in-one/src/server.js
