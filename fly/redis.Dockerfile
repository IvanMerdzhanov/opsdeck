FROM redis:7-alpine
# Queue-only Redis: no persistence (schedulers are re-created by monitor-worker on boot).
CMD ["sh", "-c", "exec redis-server --requirepass \"$REDIS_PASSWORD\" --save '' --appendonly no"]
