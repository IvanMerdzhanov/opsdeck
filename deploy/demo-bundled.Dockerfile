# Self-contained demo image: OpsDeck all-in-one + Postgres + Redis in one container (ADR-0006).
# Data is ephemeral by design: every boot starts from the seed. Build context: repository root.
FROM node:22-alpine
RUN apk add --no-cache postgresql17 postgresql17-client postgresql17-contrib redis su-exec
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY services/registry-api/package.json services/registry-api/
COPY services/monitor-worker/package.json services/monitor-worker/
COPY services/incident-api/package.json services/incident-api/
COPY services/demo-target/package.json services/demo-target/
COPY services/all-in-one/package.json services/all-in-one/
RUN npm ci --omit=dev --ignore-scripts

COPY packages ./packages
COPY services ./services
COPY db ./db
COPY deploy/demo-bundled-entrypoint.sh /usr/local/bin/opsdeck-entrypoint
RUN chmod +x /usr/local/bin/opsdeck-entrypoint

EXPOSE 10000
ENTRYPOINT ["opsdeck-entrypoint"]
