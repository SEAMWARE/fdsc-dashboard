# Multi-stage Dockerfile for the FDSC Dashboard.
#
# Stage 1: Build the Vue.js frontend SPA.
# Stage 2: Build the BFF (Backend-for-Frontend) Express server.
# Stage 3: Production image — Node.js serves the SPA and proxies API requests.

# ---------------------------------------------------------------------------
# Stage 1: Build the frontend
# ---------------------------------------------------------------------------
FROM node:20-alpine AS build-frontend

RUN apk add --no-cache curl bash

WORKDIR /app

COPY package.json ./
# Lockfile is intentionally excluded: the x86-generated lockfile prevents
# npm from resolving platform-specific optional deps on arm64 (e.g.
# @rollup/rollup-linux-arm64-musl) due to https://github.com/npm/cli/issues/4828.
# Versions are still pinned by the semver ranges in package.json.
RUN npm install

COPY . .
RUN npm run generate:api && npm run build

# ---------------------------------------------------------------------------
# Stage 2: Build the BFF server
# ---------------------------------------------------------------------------
FROM node:20-alpine AS build-server

WORKDIR /app/server

COPY server/package.json server/package-lock.json* ./
RUN npm ci

COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

# Re-install without devDependencies for the production image
RUN rm -rf node_modules && npm ci --omit=dev

# ---------------------------------------------------------------------------
# Stage 3: Production image
# ---------------------------------------------------------------------------
FROM node:20-alpine AS production

# Run as non-root for security
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

# Copy the built BFF server (compiled JS + production node_modules)
COPY --from=build-server /app/server/dist ./server/dist
COPY --from=build-server /app/server/node_modules ./server/node_modules
COPY --from=build-server /app/server/package.json ./server/package.json

# Copy the built frontend assets
COPY --from=build-frontend /app/dist ./dist

# Environment variables with defaults (see server/src/config.ts for docs).
# Service URLs are intentionally unset — set them at deploy time to enable
# the corresponding UI tab. An unset or empty URL hides the tab.
ENV PORT=3000 \
    AUTH_CONFIG_JSON='{"providers":[]}' \
    STATIC_DIR=/app/dist

USER app

EXPOSE 3000

CMD ["node", "server/dist/index.js"]
