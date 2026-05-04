# Implementation Plan: Add Grafana Dashboards to fdsc-dashboard

## Overview

Integrate Grafana dashboard panels into the fdsc-dashboard by embedding them via iframes through the BFF proxy, following the established Apisix Dashboard integration pattern. The BFF will proxy requests to a Grafana instance and inject an `X-WEBAUTH-USER` header (extracted from the JWT) so Grafana trusts the upstream proxy via its auth proxy mode — no separate Grafana login required. Panel definitions are operator-configurable via a `GRAFANA_PANELS_JSON` environment variable. An empty `GRAFANA_URL` hides the Grafana section entirely, matching the existing service enable/disable pattern.

## Steps

### Step 1: BFF Server — Grafana configuration, proxy route, and runtime config

Add Grafana support to the BFF server layer. This is the foundational step that all subsequent frontend work depends on.

**Files to modify:**
- `server/src/config.ts` — Add `grafanaUrl` and `grafanaPanelsJson` fields to `AppConfig`. Add `GrafanaConfig` interface (with `upstreamUrl: string | null` and `panels: GrafanaPanel[]`). Add `getGrafanaConfig(config)` function that returns `null` upstream URL when `grafanaUrl` is empty, and parses `grafanaPanelsJson` into a typed array. Read `GRAFANA_URL` and `GRAFANA_PANELS_JSON` env vars in `loadConfig()`.
- `server/src/proxy.ts` — Add a `/api/grafana` proxy route constant. When `config.grafanaUrl` is non-empty, mount a proxy that forwards `/api/grafana/*` to the Grafana upstream (stripping the `/api/grafana` prefix). The proxy's `onProxyReq` handler must extract the `sub` or `preferred_username` claim from the incoming `Authorization: Bearer <jwt>` header (base64-decode the payload — no signature verification needed since the BFF trusts its own upstream), and inject `X-WEBAUTH-USER: <username>` on the proxied request. This enables Grafana's `[auth.proxy]` mode without requiring the browser to authenticate separately.
- `server/src/runtime-config.ts` — Import `getGrafanaConfig` and add a `window.__GRAFANA_CONFIG__ = <json>;` line to the `/config.js` response, following the existing `__APISIX_CONFIG__` pattern.

**Types (in `server/src/config.ts`):**
```typescript
interface GrafanaPanel {
  title: string     // Display title above the iframe
  path: string      // Grafana URL path (e.g., "/d-solo/uid/slug?panelId=1&kiosk")
  span?: number     // Vuetify grid column span (1–12, default 6)
  height?: number   // Iframe height in pixels (default 400)
}

interface GrafanaConfig {
  upstreamUrl: string | null
  panels: GrafanaPanel[]
}
```

**Environment variables:**
| Variable | Description | Default |
|---|---|---|
| `GRAFANA_URL` | Upstream Grafana URL (empty = disabled) | `""` |
| `GRAFANA_PANELS_JSON` | JSON array of panel definitions | `"[]"` |

**Acceptance criteria:**
- `loadConfig()` reads `GRAFANA_URL` and `GRAFANA_PANELS_JSON` from env.
- `getGrafanaConfig()` returns `{ upstreamUrl: null, panels: [] }` when `GRAFANA_URL` is empty.
- `getGrafanaConfig()` returns the upstream URL and parsed panels when configured.
- The proxy mounts `/api/grafana` only when `grafanaUrl` is non-empty.
- The proxy injects `X-WEBAUTH-USER` from the JWT payload on proxied requests.
- `/config.js` includes a `window.__GRAFANA_CONFIG__` global with the Grafana config.
- Invalid `GRAFANA_PANELS_JSON` (malformed JSON) falls back to an empty array with a warning log.

### Step 2: Frontend Core — Types, constants, config loader, and composable

Create the frontend Grafana module (`src/grafana/`) with types, constants, configuration loader, and a visibility composable — mirroring the existing `src/apisix/` structure.

**Files to create:**
- `src/grafana/types.ts` — Define `GrafanaPanel` (title, path, span, height) and `GrafanaConfig` (upstreamUrl, panels) interfaces. Mirror the structure from `src/apisix/types.ts`.
- `src/grafana/constants.ts` — Define `GRAFANA_ROUTE_PATH` (`'/grafana'`), `GRAFANA_ROUTE_NAME` (`'grafana-dashboards'`), `GRAFANA_PROXY_BASE_PATH` (`'/api/grafana'`), `RUNTIME_GRAFANA_CONFIG_GLOBAL` (`'__GRAFANA_CONFIG__'`), `RUNTIME_GRAFANA_CONFIG_URL_KEY` (`'upstreamUrl'`), `RUNTIME_GRAFANA_CONFIG_PANELS_KEY` (`'panels'`), and `BUILD_TIME_GRAFANA_URL_ENV_VAR` (`'VITE_GRAFANA_URL'`).
- `src/grafana/config.ts` — Implement `loadGrafanaConfig()` that reads `window.__GRAFANA_CONFIG__` (runtime injection, priority) then falls back to `import.meta.env.VITE_GRAFANA_URL` (build-time, with empty panels). Return a frozen `GrafanaConfig`. Also export `isGrafanaConfigured(config)` predicate.
- `src/composables/useGrafana.ts` — Export `useGrafana()` composable returning `{ config, isConfigured, isVisible }`. Visibility follows the same rule as Apisix: visible when configured AND (auth disabled OR user is admin). Unlike Apisix (admin-only), Grafana panels are read-only monitoring — consider making them visible to all authenticated users (not just admins). The composable should not require admin role, just authentication.

**Design decision — access control:**
Grafana dashboards are read-only monitoring panels. Unlike the Apisix Dashboard (which allows admin-level gateway configuration), Grafana panels only display metrics. Therefore, the Grafana section should be visible to **all authenticated users**, not just admins. The route should NOT have `meta: { requiresAdmin: true }`. This matches the principle of least privilege — monitoring data is useful to all operators.

**Acceptance criteria:**
- All types, constants, and config loader follow the `src/apisix/` pattern exactly.
- `loadGrafanaConfig()` correctly reads the runtime global with panels array.
- `isGrafanaConfigured()` returns `true` only when upstream URL is non-null.
- `useGrafana().isVisible` is `true` when configured AND (auth disabled OR user is authenticated).
- All public functions and interfaces are documented with JSDoc.

### Step 3: Frontend UI — View, router, navigation, and i18n

Create the Grafana view component that renders configured panels in a responsive grid of iframes, wire up the route and navigation, and add i18n strings.

**Files to create:**
- `src/views/grafana/GrafanaView.vue` — Renders one of three states (following `ApisixView.vue` pattern):
  1. **Not configured** — Info alert with setup instructions.
  2. **No panels configured** — Info alert explaining that `GRAFANA_PANELS_JSON` is empty.
  3. **Configured with panels** — A toolbar (back button + title) followed by a responsive `v-row`/`v-col` grid where each panel is an iframe. Each iframe's `src` is `GRAFANA_PROXY_BASE_PATH + panel.path` (e.g., `/api/grafana/d-solo/abc123/my-dashboard?panelId=1&kiosk`). Each iframe gets the same sandbox permissions as Apisix. Panel title is rendered as a subtitle above each iframe.

**Files to modify:**
- `src/router/index.ts` — Add Grafana route: `{ path: GRAFANA_ROUTE_PATH, name: GRAFANA_ROUTE_NAME, component: () => import('@/views/grafana/GrafanaView.vue') }`. No `requiresAdmin` meta (monitoring is for all users). Import constants from `src/grafana/constants.ts`.
- `src/App.vue` — Add Grafana nav item in the navigation drawer (after the Apisix entry or in the services section). Conditionally render with `v-if="grafanaVisible"`. Use icon `mdi-chart-line` or `mdi-monitor-dashboard`. Import `useGrafana` composable and `GRAFANA_ROUTE_NAME` constant.
- `src/views/HomeView.vue` — Add a Grafana card (similar to the Apisix card) conditionally shown when `grafanaVisible` is true. Use the `mdi-monitor-dashboard` icon and link to the Grafana route.
- `src/locales/en.json` — Add `"grafana"` section with keys: `iframeTitle`, `toolbarBack`, `notConfiguredTitle`, `notConfigured`, `noPanelsTitle`, `noPanels`. Add `"nav.grafana"` and `"home.grafanaDescription"`.

**Acceptance criteria:**
- `GrafanaView.vue` renders panels in a grid when configured.
- Each panel iframe points to `/api/grafana/<panel.path>`.
- Panel `span` defaults to 6 (half-width), `height` defaults to 400px.
- "Not configured" state shows when `GRAFANA_URL` is empty.
- "No panels" state shows when URL is set but no panels are defined.
- Navigation drawer shows Grafana item only when `grafanaVisible` is true.
- Home view shows Grafana card only when `grafanaVisible` is true.
- All user-facing strings use i18n `t()` calls.
- Escape key navigates back to home (matching Apisix pattern).

### Step 4: Development Tooling — Vite proxy, Docker Compose, and mock/sample Grafana

Add development and local testing support: Vite dev-server proxy for Grafana, a Grafana service in Docker Compose with auth proxy configuration, and sample dashboard provisioning.

**Files to modify:**
- `vite.config.ts` — Add `/api/grafana` proxy entry. In BFF mode, forward to `BFF_URL`. In direct mode, proxy to `process.env.VITE_GRAFANA_URL || DEFAULT_GRAFANA_URL` (default `http://localhost:3100`). Add `window.__GRAFANA_CONFIG__` injection to the `runtimeConfigPlugin()`.

- `docker-compose.yml` — Add a `grafana` service using `grafana/grafana:latest` image. Configure via environment variables:
  - `GF_AUTH_PROXY_ENABLED=true` — enable auth proxy mode
  - `GF_AUTH_PROXY_HEADER_NAME=X-WEBAUTH-USER` — match BFF header injection
  - `GF_AUTH_PROXY_AUTO_SIGN_UP=true` — auto-create users
  - `GF_SECURITY_ALLOW_EMBEDDING=true` — allow iframe embedding
  - `GF_AUTH_PROXY_HEADERS=Name:X-WEBAUTH-USER` — trust the header
  - `GF_SECURITY_COOKIE_SAMESITE=none` — required for iframe embedding
  - `GF_USERS_DEFAULT_THEME=light` — match dashboard theme
  - `GF_AUTH_ANONYMOUS_ENABLED=false` — require auth proxy header
  Mount provisioning directory for a sample datasource and dashboard.
  Add `GRAFANA_URL: http://grafana:3000` and a sample `GRAFANA_PANELS_JSON` to the `dashboard` service environment.
  Add `grafana` to `depends_on` for the `dashboard` service.

**Files to create:**
- `mocks/grafana/provisioning/datasources/datasource.yml` — A sample Prometheus or TestData datasource (use Grafana's built-in TestData datasource for zero external dependencies).
- `mocks/grafana/provisioning/dashboards/dashboard.yml` — Dashboard provisioning config pointing to the sample JSON file.
- `mocks/grafana/provisioning/dashboards/sample-dashboard.json` — A simple Grafana dashboard JSON with 2–3 panels (e.g., random walk time series, table) using the TestData datasource. This gives operators a working example out of the box.

**Acceptance criteria:**
- `npm run dev` proxies `/api/grafana/*` to the local Grafana instance.
- `docker compose up --build` starts a Grafana instance with auth proxy mode enabled.
- The sample dashboard is auto-provisioned and visible in Grafana.
- The `dashboard` BFF service has `GRAFANA_URL` and `GRAFANA_PANELS_JSON` configured to point at the sample panels.
- Navigating to the Grafana section in the dashboard shows the sample panels embedded in iframes.

### Step 5: Tests — BFF and frontend test coverage

Add comprehensive tests for all new Grafana functionality, following the existing test patterns.

**Files to modify:**
- `server/src/__tests__/config.test.ts` — Add tests for:
  - `loadConfig()` reads `GRAFANA_URL` and `GRAFANA_PANELS_JSON` with correct defaults.
  - `getGrafanaConfig()` returns null upstream URL when `grafanaUrl` is empty.
  - `getGrafanaConfig()` returns configured URL and parsed panels when set.
  - `getGrafanaConfig()` handles malformed `GRAFANA_PANELS_JSON` gracefully (empty array fallback).

- `server/src/__tests__/proxy.test.ts` — Add tests for:
  - Grafana proxy is mounted when `grafanaUrl` is non-empty.
  - Grafana proxy is NOT mounted when `grafanaUrl` is empty.
  - `X-WEBAUTH-USER` header is injected from JWT payload on proxied requests.
  - Missing/invalid JWT does not crash the proxy (header simply omitted).

- `server/src/__tests__/runtime-config.test.ts` — Add tests for:
  - `/config.js` includes `window.__GRAFANA_CONFIG__` when Grafana is configured.
  - `/config.js` includes null upstream URL when Grafana is not configured.
  - `/config.js` includes the panels array in the Grafana config.

**Files to create:**
- `src/grafana/__tests__/config.test.ts` — Test `loadGrafanaConfig()` and `isGrafanaConfigured()`:
  - Returns unconfigured when no runtime global exists.
  - Returns configured when `window.__GRAFANA_CONFIG__` is set with URL and panels.
  - Falls back to build-time env var when runtime global is absent.
  - `isGrafanaConfigured()` returns correct boolean for both states.

- `src/composables/__tests__/useGrafana.test.ts` — Test `useGrafana()` composable:
  - `isVisible` is `false` when not configured.
  - `isVisible` is `true` when configured and auth is disabled.
  - `isVisible` is `true` when configured and user is authenticated.
  - `isVisible` is `false` when configured but user is not authenticated (when auth is enabled).

- `src/views/grafana/__tests__/GrafanaView.test.ts` — Test view component rendering:
  - Renders "not configured" alert when upstream URL is null.
  - Renders "no panels" alert when URL is set but panels array is empty.
  - Renders correct number of iframes when panels are configured.
  - Each iframe src is correctly constructed from `GRAFANA_PROXY_BASE_PATH + panel.path`.
  - Back button navigates to home.

**Acceptance criteria:**
- All new BFF tests pass (`cd server && npm test`).
- All new frontend tests pass (`npm run test`).
- Tests use parameterized test cases where applicable (e.g., multiple panel configs).
- No existing tests are broken by the changes.
- Code passes lint (`npm run lint`) and type-check (`npm run build`).
