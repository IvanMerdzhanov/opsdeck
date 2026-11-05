# Single-container build for free hosting (Render). Build context: repository root.
FROM node:22-alpine
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

USER node
EXPOSE 10000
CMD ["node", "services/all-in-one/src/server.js"]
