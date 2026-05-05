# FDSC Dashboard

A Vue 3 dashboard for managing FIWARE Data Space Connector (DSC) resources including Trusted Issuers Lists (TIL), Credentials Config Service (CCS), ODRL Policies, an embedded [Apache APISIX Dashboard](https://github.com/apache/apisix-dashboard) for gateway management, and embedded [Grafana](https://grafana.com/) panels for monitoring.

## Tech Stack

- **Vue 3** with Composition API and TypeScript
- **Vuetify 3** – Material Design component library
- **Vue Router** – client-side routing
- **Pinia** – state management
- **Vue I18n** – internationalization (English by default)
- **Vite** – build tooling and dev server
- **Vitest** – unit testing framework

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- npm (comes with Node.js)
- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/) (optional, for containerized setup)

## Local Development Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Start the development server

```bash
npm run dev
```

The app starts at **http://localhost:3000**. Hot-module replacement is enabled so changes are reflected instantly.

### 3. Backend API routing

The frontend sends all API requests to relative `/api/*` paths on the same origin.
In development the Vite dev server proxies these to local backend services
(see `vite.config.ts` for default target URLs). In production the Express BFF
server proxies them to downstream services on a private network.

| Service            | Env Variable                 | Default                |
|--------------------|------------------------------|------------------------|
| TIL                | `VITE_TIL_API_URL`           | `http://localhost:8080` |
| TIR                | `VITE_TIR_API_URL`           | `http://localhost:8081` |
| CCS                | `VITE_CCS_API_URL`           | `http://localhost:8082` |
| ODRL               | `VITE_ODRL_API_URL`          | `http://localhost:8083` |
| Apisix Dashboard   | `VITE_APISIX_DASHBOARD_URL`  | `http://localhost:9000` |

Override them by setting environment variables before running the dev server:

```bash
VITE_TIL_API_URL=http://my-til-host:8080 npm run dev
```

## Running with Docker Compose (Mock Backends)

The project includes mock backend services that return empty collections so the UI can render without real services running. Docker Compose starts the BFF server alongside lightweight nginx-based mock backends that serve static JSON responses.

```bash
# Build and start the dashboard with mock backends
docker compose up --build
```

This starts:

| Service                  | Description                                          |
|--------------------------|------------------------------------------------------|
| `dashboard`              | The dashboard UI on **http://localhost:8080**         |
| `mock-til`               | Mock Trusted Issuers List service                    |
| `mock-tir`               | Mock Trusted Issuers Registry                        |
| `mock-ccs`               | Mock Credentials Config Service                      |
| `mock-odrl`              | Mock ODRL-PAP service                                |
| `mock-apisix-dashboard`  | Mock Apisix Dashboard (placeholder page at `/apisix-dashboard/`) |

Stop the stack with:

```bash
docker compose down
```

## Authentication

The dashboard can attach an `Authorization: Bearer <jwt>` header to every outbound call it makes to the four backend APIs (TIL, TIR, CCS, ODRL-PAP). When no token is configured, no `Authorization` header is sent and the dashboard behaves exactly as it did before the feature was introduced.

### Build-time environment variable

To seed a token at build time (typically for demo or deployment pipelines), set `VITE_AUTH_TOKEN` before running `npm run dev` or `npm run build`:

| Service          | Env Variable       | Default                |
|------------------|--------------------|------------------------|
| Auth token (JWT) | `VITE_AUTH_TOKEN`  | *(empty — no header)*  |

```bash
VITE_AUTH_TOKEN=eyJhbGciOi... npm run dev
```

The env-provided value is used only when no runtime token is present in the browser — it is **not** persisted to `localStorage`, so runtime changes always win.

### Runtime dialog (app bar)

Every page shows a shield icon in the top-right app bar:

| Icon                              | Meaning                             |
|-----------------------------------|-------------------------------------|
| `mdi-shield-lock` (locked)        | A JWT is configured and is being sent with every API request. |
| `mdi-shield-lock-open-outline`    | No JWT is configured; no `Authorization` header is sent. |

Click the icon to open the **Authentication Token** dialog. The dialog shows the current token (if any) in a monospace textarea. Paste a JWT and press **Save** to configure it, or press **Clear** to remove it. The change takes effect immediately on the next API call.

### Persistence

Runtime tokens are stored in the browser under the `localStorage` key `fdsc-dashboard-auth-token`. They survive page reloads and, within the same browser profile, separate tabs. Saving an empty value (or pressing **Clear**) deletes the key.

### Scope

All four generated API clients — `TilOpenAPI`, `TirOpenAPI`, `CcsOpenAPI`, and `OdrlOpenAPI` — share a single token resolver configured in `src/api/config.ts`. There is no way to send a token to one backend but not another: the dashboard either authenticates to all four or to none.

## Running Tests

The project uses [Vitest](https://vitest.dev/) as its test framework with `jsdom` for DOM emulation and `@vue/test-utils` for Vue component testing.

### Run all tests once

```bash
npm run test
```

This executes all `*.spec.ts` files under `src/` in a single run and exits.

### Run tests in watch mode

```bash
npm run test:watch
```

Vitest will re-run affected tests automatically whenever source or test files change. This is the recommended mode during development.

### Run a specific test file

```bash
npx vitest run src/stores/__tests__/til.spec.ts
```

### Run tests matching a name pattern

```bash
npx vitest run -t "should fetch issuers"
```

### Test file locations

Test files are co-located with the source code they cover:

| Store   | Test File                                |
|---------|------------------------------------------|
| TIL     | `src/stores/__tests__/til.spec.ts`       |
| CCS     | `src/stores/__tests__/ccs.spec.ts`       |
| Policies| `src/stores/__tests__/policies.spec.ts`  |

### Configuration

The Vitest configuration is defined in `vitest.config.ts` at the project root. It uses the `jsdom` test environment, enables global test APIs (`describe`, `it`, `expect`), and resolves the `@/` path alias to `src/`.

## Available Scripts

| Command                 | Description                                             |
|-------------------------|---------------------------------------------------------|
| `npm run dev`           | Start the Vite dev server with HMR                      |
| `npm run build`         | Type-check and build for production                     |
| `npm run preview`       | Preview the production build locally                    |
| `npm run test`          | Run all frontend unit tests once                        |
| `npm run test:watch`    | Run frontend unit tests in watch mode                   |
| `npm run lint`          | Lint source files with ESLint (auto-fix)                |
| `npm run format`        | Format source files with Prettier                       |
| `npm run bff:dev`       | Start the BFF server in dev mode (tsx watch)            |
| `npm run bff:build`     | Build the BFF server (TypeScript → JavaScript)          |
| `npm run bff:test`      | Run BFF server tests                                    |
| `npm run license:check` | Verify every in-scope source file has a license header  |
| `npm run license:apply` | Prepend the Apache 2.0 license header to any file that is missing it |

## Linting & Code Formatting

The project uses [ESLint](https://eslint.org/) for static analysis and [Prettier](https://prettier.io/) for code formatting.

### Run the linter

```bash
npm run lint
```

This runs ESLint across all `.vue`, `.js`, `.jsx`, `.cjs`, `.mjs`, `.ts`, `.tsx`, `.cts`, and `.mts` files with the `--fix` flag, which automatically corrects fixable issues (e.g. missing semicolons, import order). Non-fixable issues are reported in the terminal output.

### Run the linter without auto-fix

To check for issues without modifying files:

```bash
npx eslint . --ext .vue,.js,.jsx,.cjs,.mjs,.ts,.tsx,.cts,.mts
```

### Lint a specific file or directory

```bash
npx eslint src/views/til/TilListView.vue --fix
npx eslint src/stores/ --fix
```

### Format code with Prettier

```bash
npm run format
```

This formats all files under `src/` using Prettier.

### ESLint configuration

The ESLint configuration lives in `.eslintrc.cjs` and extends:

| Preset                                  | Purpose                                  |
|-----------------------------------------|------------------------------------------|
| `plugin:vue/vue3-recommended`           | Vue 3 recommended rules                  |
| `eslint:recommended`                    | ESLint core recommended rules            |
| `plugin:@typescript-eslint/recommended` | TypeScript-specific recommended rules    |

Notable rule overrides:

- `vue/multi-word-component-names` is **off** — single-word component names are allowed.
- `vue/valid-v-slot` allows modifiers (e.g. `v-slot:item.actions`).
- Test files (`*.spec.ts`, `src/test-setup.ts`) have relaxed rules: `@typescript-eslint/no-explicit-any` and `@typescript-eslint/no-unused-vars` are disabled.

### Integrating with your editor

Most editors support ESLint integration:

- **VS Code**: Install the [ESLint extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint). Enable "Format on Save" and set ESLint as the default formatter for `.vue` and `.ts` files.
- **WebStorm / IntelliJ**: ESLint support is built in. Go to *Settings → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint* and select "Automatic ESLint configuration".

## License headers

Every in-scope source file must carry the Apache 2.0 copyright header defined in
[`scripts/license-header.txt`](scripts/license-header.txt). Header verification and
insertion are handled by the [`license-check-and-add`](https://www.npmjs.com/package/license-check-and-add)
npm package, which is driven by [`license-check-and-add-config.json`](license-check-and-add-config.json)
at the repo root.

### Scripts

- `npm run license:check` — verifies that every in-scope file starts with the
  expected header. Fails (non-zero exit) and prints the offending file paths when a
  file is missing the header. This is the command CI runs.
- `npm run license:apply` — prepends the header to any in-scope file that is
  missing it. The operation is idempotent: running it on an already-compliant tree
  leaves every file byte-identical.

### Scope

The default config limits the tool to `.ts` and `.vue` files under `src/`. The
following paths are intentionally excluded:

- `src/api/generated/**` — regenerated from upstream OpenAPI specs; headers are
  re-applied automatically by `scripts/generate-api-clients.sh` (see below).
- `src/locales/**` — JSON files cannot contain comments.
- `.github/**`, `mocks/**`, `public/**`, `scripts/**` and root-level config files
  (`vite.config.ts`, `tsconfig*.json`, `Dockerfile`, etc.) — not considered
  "source files" per the ticket scope.

### CI enforcement

The [`license-check`](.github/workflows/license-check.yml) GitHub Actions workflow
runs `npm run license:check` on every push to `main` and every pull request, so a
PR that introduces an unlicensed file will fail CI.

### Adding a new source file

Create the file as usual, then run:

```bash
npm run license:apply
```

…and commit the resulting change alongside your other modifications. Alternatively,
paste the content of `scripts/license-header.txt` (wrapped in a `/* … */` block
comment) at the top of the file manually.

### Regenerated API clients

When you run `npm run generate:api`, the script calls `license-check-and-add` a
second time using [`license-check-and-add-generated-config.json`](license-check-and-add-generated-config.json),
which is narrowed to `src/api/generated/**`. This keeps the generated output
license-compliant without forcing the default `license:check` task to scan
machine-written code.

## Building for Production

```bash
npm run build
```

The production bundle is output to the `dist/` directory. You can preview it with:

```bash
npm run preview
```

### Docker Image

Build a standalone Docker image:

```bash
docker build -t fdsc-dashboard .
docker run -p 8080:3000 fdsc-dashboard
```

The image uses a multi-stage build: Node 20 builds the frontend SPA and the BFF
server, then a slim Node.js runtime image serves the SPA and proxies API requests
via the Express BFF (see `server/`).

## Authentication (OAuth2 / OpenID Connect)

The dashboard supports optional OAuth2 / OpenID Connect authentication:

- **Default:** no OAuth2 providers are configured. The dashboard runs exactly as before — no sign-in screen, no router guards, no user menu.
- **Configured:** one or more providers are declared via a JSON configuration. All users must sign in before using the dashboard and every action is gated by their resolved role.

Two canonical roles are recognised:

| Role     | Capabilities                                          |
|----------|-------------------------------------------------------|
| `viewer` | Read-only access to every endpoint.                   |
| `admin`  | Full access, including create / update / delete.      |

### Runtime configuration with `AUTH_CONFIG_JSON`

In production the Docker image reads a single environment variable,
`AUTH_CONFIG_JSON`, at container start. The value must be a JSON string
that matches the `AuthConfig` shape declared in `src/auth/types.ts`:

```json
{
  "providers": [
    {
      "id": "keycloak",
      "displayName": "Keycloak",
      "issuer": "https://keycloak.example.com/realms/fdsc",
      "clientId": "fdsc-dashboard",
      "scopes": ["openid", "profile"],
      "rolesClaimPath": "realm_access.roles",
      "roleMapping": {
        "fdsc-admin": "admin",
        "fdsc-viewer": "viewer"
      },
      "silentRenew": true
    }
  ]
}
```

| Field            | Required | Description                                                                                             |
|------------------|----------|---------------------------------------------------------------------------------------------------------|
| `id`             | yes      | URL-safe identifier (used in callback URLs and storage keys).                                           |
| `displayName`    | yes      | Human-readable label shown in the login picker.                                                         |
| `issuer`         | yes      | OIDC issuer URL (discovery document is fetched from `<issuer>/.well-known/openid-configuration`).       |
| `clientId`       | yes      | OAuth2 client ID registered with the identity provider.                                                 |
| `scopes`         | no       | Space of scopes to request. Defaults to `["openid", "profile"]` when omitted.                           |
| `rolesClaimPath` | no       | Dotted path to the role list inside the ID/access-token claims. Defaults to `realm_access.roles`.       |
| `roleMapping`    | no       | Map of provider-specific role names to the canonical `viewer` / `admin` roles. Unmapped → `viewer`.     |
| `silentRenew`    | no       | Enable OIDC silent token renewal via a hidden iframe. Defaults to `false`.                              |

Launch an image with authentication enabled:

```bash
docker run -p 8080:3000 \
  -e AUTH_CONFIG_JSON='{"providers":[{"id":"keycloak","displayName":"Keycloak","issuer":"https://keycloak.example.com/realms/fdsc","clientId":"fdsc-dashboard","roleMapping":{"fdsc-admin":"admin","fdsc-viewer":"viewer"}}]}' \
  fdsc-dashboard
```

If `AUTH_CONFIG_JSON` is **unset or empty**, the entrypoint falls back to
`{"providers":[]}` and the dashboard runs unauthenticated.

#### How it works

1. The BFF Express server reads `AUTH_CONFIG_JSON` from the environment at
   startup (see `server/src/runtime-config.ts`).
2. When the browser requests `GET /config.js`, the BFF responds with
   `window.__AUTH_CONFIG__ = <AUTH_CONFIG_JSON>;` as dynamically generated
   JavaScript.
3. `index.html` loads `/config.js` **before** the application bundle, so
   `window.__AUTH_CONFIG__` is populated by the time
   `src/auth/config.ts#loadAuthConfig()` reads it.

Because the configuration is served dynamically, operators can enable,
disable, or re-configure OAuth2 without rebuilding the image — just supply
a different value for `AUTH_CONFIG_JSON` (for example via Kubernetes
`env` / `envFrom`, Docker Compose, or `docker run -e`).

### Build-time fallback for local development

For local `npm run dev` the BFF server is not running by default, so the
`/config.js` endpoint is not available. Contributors can instead set the
Vite environment variable `VITE_AUTH_PROVIDERS` to the same JSON payload:

```bash
VITE_AUTH_PROVIDERS='{"providers":[{"id":"keycloak", ... }]}' npm run dev
```

The loader uses `window.__AUTH_CONFIG__` when present, otherwise falls back
to `VITE_AUTH_PROVIDERS`, otherwise disables auth.

### Example: Keycloak realm configuration

1. Create a realm (e.g. `fdsc`).
2. Add a public client `fdsc-dashboard` with:
   - **Client authentication:** off (the dashboard is a SPA; it uses PKCE).
   - **Valid redirect URIs:** `https://dashboard.example.com/callback/keycloak`
     (and `http://localhost:3000/callback/keycloak` for local dev).
   - **Valid post logout redirect URIs:** `https://dashboard.example.com/login`.
   - **Web origins:** `https://dashboard.example.com` (and `http://localhost:3000`).
3. Create two realm roles: `fdsc-admin` and `fdsc-viewer`.
4. Assign the appropriate role to each user or group.
5. Set `AUTH_CONFIG_JSON` to a JSON document pointing at the realm, as in
   the sample above.

## Apisix Dashboard Integration

The [Apache APISIX Dashboard](https://github.com/apache/apisix-dashboard) is
**embedded** inside fdsc-dashboard via a same-origin reverse-proxy and iframe,
rather than reimplemented. Users access it at the `/apisix` route within the
fdsc-dashboard shell — the app bar and navigation drawer remain visible so they
can switch back to TIL / CCS / Policies with a single click.

The integration is **optional**: when the upstream Apisix Dashboard URL is not
configured the navigation entry is hidden and the `/apisix` route renders an
informational "not configured" alert instead of a broken iframe.

### Environment variables

| Variable | Context | Default | Description |
|---|---|---|---|
| `VITE_APISIX_DASHBOARD_URL` | Local dev (`npm run dev`) | `http://localhost:9000` | Upstream URL the Vite dev-server proxy forwards `/apisix-dashboard/*` to. |
| `APISIX_DASHBOARD_URL` | Production container | *(unset — integration disabled)* | Upstream URL injected at container start via the nginx entrypoint (`envsubst`). |

Set the variable for your environment to enable the integration:

```bash
# Local development
VITE_APISIX_DASHBOARD_URL=http://localhost:9000 npm run dev

# Docker production image
docker run -p 8080:80 \
  -e APISIX_DASHBOARD_URL=http://apisix-dashboard:9000 \
  fdsc-dashboard
```

### Architecture

```
┌──────────────────────────────────────────┐
│  Browser                                 │
│  ┌────────────────────────────────────┐  │
│  │ fdsc-dashboard (Vue SPA)           │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │ <iframe src="/apisix-        │  │  │
│  │  │         dashboard/">         │  │  │
│  │  └──────────────────────────────┘  │  │
│  └────────────────────────────────────┘  │
└──────────────┬───────────────────────────┘
               │ same-origin requests
               ▼
┌──────────────────────────────────────────┐
│  nginx / Vite dev-server                 │
│  /apisix-dashboard/* ──► upstream:9000   │
└──────────────────────────────────────────┘
```

### Access control

Only users with the **admin** role can see the Apisix Dashboard navigation
entry and access the `/apisix` route. When authentication is disabled
(no `AUTH_CONFIG_JSON`), the dashboard runs in legacy open mode and all
users are treated as admin.

### SSO with Apisix Dashboard

The embedded Apisix Dashboard authenticates **directly** with the OIDC
Identity Provider (IdP) — fdsc-dashboard does **not** inject or forward
tokens into the iframe. Single Sign-On works because both applications
share the same OIDC SSO session on the same origin.

To achieve seamless SSO, operators must configure the Apisix Dashboard's
OIDC authentication against the **same IdP** (and, ideally, the same OIDC
client or a sibling client on the same issuer) that fdsc-dashboard uses.

#### Operator checklist

1. **Same OIDC issuer.** The `issuer` in the Apisix Dashboard's
   `conf/conf.yaml` → `authentication.oidc` block must match the `issuer`
   in fdsc-dashboard's `AUTH_CONFIG_JSON` provider entry.
2. **Same (or sibling) OIDC client.** Use the same `clientId` or register a
   second client on the same issuer realm. Both approaches share the SSO
   session.
3. **Redirect URI.** Set the redirect URI to the same-origin
   `/apisix-dashboard/` path so the OIDC redirect terminates inside the
   iframe (e.g. `https://dashboard.example.com/apisix-dashboard/callback`).
4. **Silent SSO (`prompt=none`).** When an active SSO session already exists,
   the IdP should be able to issue tokens without a visible login prompt.
   Ensure the Apisix Dashboard's OIDC plugin is configured to try
   `prompt=none` first.
5. **Roles claim path.** The roles claim path in the Apisix Dashboard's OIDC
   configuration must match the one configured in fdsc-dashboard's
   `rolesClaimPath` (defaults to `realm_access.roles` for Keycloak). Adjust
   to suit your IdP — for example: `roles` for Authentik, `groups` for Dex.

#### Example: Keycloak realm configuration

Register the Apisix Dashboard as a public OIDC client in the same Keycloak
realm used by fdsc-dashboard:

```json
{
  "clientId": "apisix-dashboard",
  "enabled": true,
  "publicClient": true,
  "standardFlowEnabled": true,
  "redirectUris": [
    "https://dashboard.example.com/apisix-dashboard/*"
  ],
  "webOrigins": [
    "https://dashboard.example.com"
  ],
  "protocolMappers": [
    {
      "name": "realm-roles",
      "protocol": "openid-connect",
      "protocolMapper": "oidc-usermodel-realm-role-mapper",
      "config": {
        "claim.name": "realm_access.roles",
        "jsonType.label": "String",
        "multivalued": "true",
        "id.token.claim": "true",
        "access.token.claim": "true"
      }
    }
  ]
}
```

#### Example: Apisix Dashboard `conf/conf.yaml` snippet

```yaml
authentication:
  # Enable OIDC authentication against the same IdP as fdsc-dashboard.
  type: openid-connect
  oidc:
    issuer: "https://keycloak.example.com/realms/fdsc"
    client_id: "apisix-dashboard"
    # redirect_uri must land inside the proxied /apisix-dashboard/ path
    redirect_uri: "https://dashboard.example.com/apisix-dashboard/callback"
    scope: "openid profile"
    # Try silent SSO first — avoids a visible login prompt when the
    # user already has an active SSO session from fdsc-dashboard.
    prompt: "none"
    # Logout should return to the fdsc-dashboard login page.
    logout_redirect_uri: "https://dashboard.example.com/login"
```

#### Generic OIDC provider configuration

For providers other than Keycloak (e.g. Authentik, Dex, Auth0):

1. Register an OIDC client on the same issuer.
2. Ensure the ID/access token includes a roles or groups claim.
3. Set `rolesClaimPath` in fdsc-dashboard's `AUTH_CONFIG_JSON` to match the
   claim path your IdP uses (e.g. `roles`, `groups`,
   `https://example.com/roles`).
4. Configure the Apisix Dashboard's OIDC plugin with the same issuer,
   client ID, and scope.

### Role Propagation

fdsc-dashboard recognises two canonical roles:

| Role | fdsc-dashboard | Apisix Dashboard |
|---|---|---|
| `admin` | Full access — create, update, delete across TIL / CCS / Policies; access to the embedded Apisix Dashboard. | Full access to routes, services, consumers, and plugins. |
| `viewer` | Read-only access to all endpoints. The Apisix Dashboard navigation entry is **hidden**. | Read-only (if OIDC role mapping is configured accordingly). |

Both applications resolve roles from the **same OIDC token claim**. The
claim path is configurable per provider via `rolesClaimPath` in
fdsc-dashboard's `AUTH_CONFIG_JSON` (defaults to `realm_access.roles` for
Keycloak compatibility).

**Important:** fdsc-dashboard does **not** forward its own tokens to the
Apisix Dashboard. The embedded dashboard authenticates directly with the
IdP via its own OIDC redirect flow. This avoids the security pitfall of
injecting a dashboard-issued token into a third-party application. Role
consistency is guaranteed because both apps read the same claim from
tokens issued by the same IdP.

## Grafana Dashboard Integration

The dashboard can embed [Grafana](https://grafana.com/) panels as read-only
monitoring views inside the fdsc-dashboard shell. Each panel is rendered in
its own `<iframe>` within a responsive grid layout, so operators can combine
several Grafana panels (time-series, gauges, tables, etc.) into a single
dashboard page alongside the TIL / CCS / Policies views.

The integration is **optional**: when the Grafana URL is not configured the
navigation entry is hidden and the `/grafana` route renders an informational
"not configured" alert.

### Environment variables

| Variable | Context | Default | Description |
|---|---|---|---|
| `GRAFANA_URL` | Production container | *(unset — integration disabled)* | Internal upstream URL for the Grafana instance. When non-empty the BFF mounts a reverse proxy at `/api/grafana/*` and the navigation entry becomes visible. |
| `GRAFANA_IFRAME_URL` | Production container | *(unset — use BFF proxy)* | **Public** URL of the Grafana instance used as the iframe `src`. When set, iframes load directly from this URL instead of routing through the BFF proxy. This is the recommended production setup — see [Why a public URL?](#why-a-public-url) below. |
| `GRAFANA_PANELS_JSON` | Production container | `[]` | JSON array of panel definitions. Each entry becomes one iframe in the responsive grid. |
| `VITE_GRAFANA_URL` | Local dev (`npm run dev`) | *(unset)* | Upstream Grafana URL for local development (no panels — URL only). |

Set the variables for your environment to enable the integration:

```bash
# Docker production image
docker run -p 8080:3000 \
  -e GRAFANA_URL=http://grafana:3000 \
  -e GRAFANA_IFRAME_URL=https://grafana.example.com \
  -e GRAFANA_PANELS_JSON='[{"title":"CPU","path":"/d-solo/abc/cpu?panelId=1&kiosk","span":12,"height":400}]' \
  fdsc-dashboard

# Local development (URL only, no panels)
VITE_GRAFANA_URL=http://localhost:3001 npm run dev
```

### Panel configuration

The `GRAFANA_PANELS_JSON` environment variable accepts a JSON array of panel
objects. Each panel is rendered as a separate `<iframe>` in a responsive
Vuetify grid:

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `title` | `string` | yes | — | Display title rendered above the iframe. |
| `path` | `string` | yes | — | Grafana URL path appended to the iframe base URL (e.g. `/d-solo/uid/slug?panelId=1&kiosk` for a single panel, or `/d/uid/slug?orgId=1&kiosk` for a full dashboard). |
| `span` | `number` | no | `6` | Vuetify grid column span (1–12). `12` = full width, `6` = half width. |
| `height` | `number` | no | `400` | Iframe height in pixels. |

Example with multiple panels in different layouts:

```json
[
  {
    "title": "API Routes Overview",
    "path": "/d/apisix-routes/apisix-routes?orgId=1&kiosk",
    "span": 12,
    "height": 500
  },
  {
    "title": "Request Rate",
    "path": "/d-solo/abc/overview?orgId=1&panelId=1&kiosk",
    "span": 6,
    "height": 300
  },
  {
    "title": "Error Rate",
    "path": "/d-solo/abc/overview?orgId=1&panelId=2&kiosk",
    "span": 6,
    "height": 300
  }
]
```

### Why a public URL?

Grafana is a full Single Page Application. When embedded through a sub-path
reverse proxy (e.g. `/api/grafana/*`), Grafana's HTML contains
`<base href="/">` which causes the browser to resolve all asset URLs (CSS,
JavaScript, fonts) against the **host root** — not against the proxy path.
This means the BFF serves its own SPA instead of Grafana's assets, and the
user sees the fdsc-dashboard rendered inside the iframe instead of the Grafana
panel.

Setting `GRAFANA_IFRAME_URL` to Grafana's own public URL (e.g.
`https://grafana.example.com`) avoids this problem entirely: the iframe loads
Grafana directly and all asset paths resolve correctly.

The BFF reverse proxy at `/api/grafana/*` remains available for any future
programmatic API calls to Grafana, but it is not suitable for full-page
iframe embedding.

### Grafana configuration requirements

For iframe embedding to work, the Grafana instance itself must be configured
to allow it. Two settings are required in Grafana's `grafana.ini`
(or equivalent Helm values):

```ini
[security]
allow_embedding = true

[auth.anonymous]
enabled = true
org_role = Viewer
```

- **`allow_embedding = true`** removes the `X-Frame-Options: deny` header
  that Grafana sends by default, which would block the browser from rendering
  Grafana inside an iframe.
- **`auth.anonymous`** allows the iframe to access Grafana dashboards without
  a separate login. The `Viewer` role ensures anonymous users can only view
  dashboards, not edit them.

#### Helm chart example (Grafana subchart)

When deploying Grafana via its Helm chart, add the settings under
`grafana.ini`:

```yaml
grafana:
  grafana.ini:
    security:
      allow_embedding: true
    auth.anonymous:
      enabled: true
      org_role: Viewer
```

### Architecture

```
┌──────────────────────────────────────────────┐
│  Browser                                     │
│  ┌────────────────────────────────────────┐  │
│  │ fdsc-dashboard (Vue SPA)               │  │
│  │  ┌──────────────────────────────────┐  │  │
│  │  │ <iframe src="https://grafana     │  │  │
│  │  │  .example.com/d-solo/uid/...">   │  │  │
│  │  └──────────────────────────────────┘  │  │
│  └────────────────────────────────────────┘  │
└──────────────┬───────────────────────────────┘
               │ cross-origin request
               ▼
┌──────────────────────────────────────────────┐
│  Grafana (public URL)                        │
│  allow_embedding: true                       │
│  auth.anonymous.enabled: true                │
└──────────────────────────────────────────────┘
```

When `GRAFANA_IFRAME_URL` is **not** set, the iframes fall back to the BFF
reverse proxy (`/api/grafana/*`). This works for simple API-level requests
but **not** for full-page iframe embedding (see
[Why a public URL?](#why-a-public-url)).

### Access control

Unlike the Apisix Dashboard (which requires the **admin** role), Grafana
panels are read-only monitoring views visible to **all authenticated users**
— both `viewer` and `admin` roles can access the `/grafana` route.

When authentication is disabled (no `AUTH_CONFIG_JSON`), the Grafana entry
is visible to everyone.

## Project Structure

```
src/                         # Frontend (Vue 3 SPA)
  App.vue                    # Root component with navigation drawer
  main.ts                    # Application entry point
  router/index.ts            # Route definitions
  stores/                    # Pinia stores (til.ts, ccs.ts, policies.ts, auth.ts)
    __tests__/               # Unit tests for stores
  plugins/
    vuetify.ts               # Vuetify configuration and theming
    i18n.ts                  # Vue I18n setup
  locales/
    en.json                  # English translations
  composables/
    useTheme.ts              # Theme toggle composable
    useLocale.ts             # Locale switching
    useAuth.ts               # Auth composable (OAuth2/OIDC + token modes)
    useApisix.ts             # Apisix Dashboard visibility composable
    useGrafana.ts            # Grafana Dashboard visibility composable
  apisix/
    config.ts                # Apisix configuration loader (runtime + build-time)
    constants.ts             # Named constants (paths, route names, env vars)
    types.ts                 # ApisixConfig type definition
  grafana/
    config.ts                # Grafana configuration loader (runtime + build-time)
    constants.ts             # Named constants (paths, route names, env vars)
    types.ts                 # GrafanaConfig / GrafanaPanel type definitions
  api/
    config.ts                # Wires generated clients to /api/<service> paths
    generated/               # AUTO-GENERATED by scripts/generate-api-clients.sh
  views/
    HomeView.vue             # Landing page
    til/                     # Trusted Issuers List views
    ccs/                     # Credentials Config Service views
    policies/                # ODRL Policy views
    apisix/                  # Embedded Apisix Dashboard (iframe view)
    grafana/                 # Embedded Grafana panels (iframe grid view)
server/                      # BFF (Backend-for-Frontend) Express server
  src/
    index.ts                 # Express app entry point
    config.ts                # Env var configuration
    proxy.ts                 # Proxy middleware for downstream services
    health.ts                # Health check endpoint
    static.ts                # Static file serving + SPA fallback
    runtime-config.ts        # /config.js endpoint for auth config
    __tests__/               # BFF server tests
mocks/                       # Mock backend data and nginx configs
scripts/                     # Build and code generation scripts
```

## Theming

The dashboard is fully themable via Vuetify's theming system. Light and dark themes are configured in `src/plugins/vuetify.ts`. A theme toggle is available in the UI via the `useTheme` composable.

## Localization

Translations are managed with Vue I18n. Language files live in `src/locales/`. Currently only English (`en.json`) is provided. To add a new language, create a new JSON file in that directory and register it in `src/plugins/i18n.ts`.

## Backend Services

This dashboard is designed to work with the following FIWARE services:

- **TIL** – [Trusted Issuers List](https://github.com/FIWARE/trusted-issuers-list)
- **TIR** – Global Trusted Issuers Registry (EBSI-compatible, same repo as TIL)
- **CCS** – [Credentials Config Service](https://github.com/FIWARE/credentials-config-service)
- **Policies** – [ODRL-PAP](https://github.com/SEAMWARE/odrl-pap)
- **Apisix Dashboard** – [Apache APISIX Dashboard](https://github.com/apache/apisix-dashboard) (embedded via same-origin reverse proxy at `/apisix-dashboard/`)
- **Grafana** – [Grafana](https://grafana.com/) (embedded via cross-origin iframes pointing at the public Grafana URL)

API clients for TIL, TIR, CCS, and Policies are kept in sync with the OpenAPI specifications published by those services. The Apisix Dashboard and Grafana are embedded as-is — no API clients are generated for them.

## CI / CD Pipeline

The project ships with a full GitHub Actions pipeline. The workflows live under
[`.github/workflows/`](.github/workflows/).

### Overview

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `pr-labels.yml` | `pull_request` | Enforces exactly one `major` / `minor` / `patch` label and validates the PR description format. |
| `test.yml`      | `push`, `pull_request` | Runs `npm ci`, `npm run generate:api`, `npm run lint`, `npm run build`, and `npm test --if-present`. |
| `pr-build.yml`  | `pull_request` | Builds a multi-arch (`linux/amd64`, `linux/arm64`) Docker image and pushes it to Quay.io tagged `<nextVersion>-PRE-<shortSha>`. |
| `release.yml`   | `push` to `main` | Computes the next version, tags the repo, builds and pushes the multi-arch image tagged `<version>` (and `latest`), promotes release notes, and creates a GitHub Release. |

### Semantic Versioning via PR Labels

Every PR **must** carry exactly one of these labels:

- `major` – breaking changes; bumps `MAJOR`, resets `MINOR`/`PATCH`.
- `minor` – new features, backward compatible; bumps `MINOR`, resets `PATCH`.
- `patch` – bug fixes, docs, tooling; bumps `PATCH`.

The workflow `pr-labels.yml` — modelled after
[FIWARE/contract-management's `check.yml`](https://github.com/FIWARE/contract-management/blob/main/.github/workflows/check.yml)
— fails the PR if the rule is violated.

### Docker Image Tagging

All images are pushed to
[`quay.io/seamware/fdsc-dashboard`](https://quay.io/repository/seamware/fdsc-dashboard).

- **Pull-request builds** → `quay.io/seamware/fdsc-dashboard:<nextVersion>-PRE-<shortSha>`
  (the `-PRE-` marker makes them easy to spot and prune).
- **Main (release) builds** → `quay.io/seamware/fdsc-dashboard:<version>` and
  `:latest`.

Images are built for `linux/amd64` and `linux/arm64` via `docker/buildx`.

### Required Secrets

Configure these in the repository settings (`Settings → Secrets and variables → Actions`):

| Secret           | Purpose                                               |
|------------------|-------------------------------------------------------|
| `QUAY_USERNAME`  | Robot account or user login for `quay.io`             |
| `QUAY_PASSWORD`  | Token/password for the above                          |

### PR Description Format

PRs must follow the template in
[`.github/pull_request_template.md`](.github/pull_request_template.md). The CI
rejects PRs that are missing the `## Summary` or `## Release Notes` sections.
The `## Release Notes` content is promoted to
[`release-notes/<version>.md`](release-notes/) on merge.

### Release-Notes Mechanism

Two options for authoring release notes:

1. **Inline** — fill in the `## Release Notes` section of the PR description
   (recommended for most changes).
2. **Dedicated file** — add `release-notes/next.md` on the PR branch.
   The release workflow prefers this file over the PR body and renames it
   to `release-notes/<version>.md` on merge. Use this for long-form or
   multi-section notes.

On every merge to `main`, the release workflow:

1. Writes `release-notes/<version>.md` using the resolution above.
2. Regenerates [`RELEASE-NOTES.md`](RELEASE-NOTES.md) — a Markdown table
   (`Version` / `Date` / `Notes`) linking to each file in `release-notes/`.
3. Creates an annotated git tag `v<version>` and a GitHub Release whose
   body is the notes file.
