# Build context: repository root.
FROM nginx:1.27-alpine
ENV RESOLVER="127.0.0.11 valid=10s ipv6=off" \
    REGISTRY_UPSTREAM=http://registry-api:3001 \
    INCIDENTS_UPSTREAM=http://incident-api:3002 \
    DEMO_UPSTREAM=http://demo-target:4000
COPY services/dashboard/default.conf.template /etc/nginx/templates/default.conf.template
COPY services/dashboard/index.html services/dashboard/app.js /usr/share/nginx/html/
