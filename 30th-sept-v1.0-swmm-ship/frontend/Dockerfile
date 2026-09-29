# ---------- Builder ----------
FROM 172.16.50.13/platform/node:22-alpine3.24-v2 AS build

WORKDIR /app

# Copy npm configuration and dependency manifests first
COPY frontend/.npmrc ./
COPY frontend/package.json frontend/package-lock.json ./

# Verify npm is configured to use internal Nexus
RUN test "$(npm config get registry)" = "http://172.16.50.12:8081/repository/npm-group-prod/" \
    && npm ci --ignore-scripts

# Copy application source
COPY frontend/ .

# Build Angular application
RUN npm run build:uat


# ---------- Runtime ----------
FROM 172.16.50.13/platform/nginx:1.29-alpine3.23-hardened-v1

# Copy Nginx configuration
COPY frontend/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/nginx.conf /etc/nginx/nginx.conf

# Copy Angular build output
COPY --from=build \
    /app/dist/swmm-frontend/browser/ \
    /usr/share/nginx/html/

    
# Create directories required by nginx when running as non-root
RUN mkdir -p \
        /var/cache/nginx \
        /var/run \
        /var/log/nginx \
        /tmp/nginx \
    && chown -R nginx:nginx \
        /var/cache/nginx \
        /var/run \
        /var/log/nginx \
        /tmp/nginx \
        /usr/share/nginx/html \
        /etc/nginx

USER nginx

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
