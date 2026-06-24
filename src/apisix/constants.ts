/*
 * Copyright 2026 Seamless Middleware Technologies S.L and/or its affiliates
 * and other contributors as indicated by the @author tags.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * Apisix Dashboard integration constants.
 *
 * Centralises every path, route name, and configuration key used by the
 * embedded Apisix Dashboard so that the proxy config, the Vue router, the
 * iframe view, and the test fixtures share a single source of truth.
 */

/**
 * On-origin base path at which the reverse proxy (nginx in production,
 * Vite dev server locally) mounts the upstream Apisix Dashboard.
 *
 * Must include a trailing slash — the upstream expects it.
 */
export const APISIX_DASHBOARD_BASE_PATH = '/apisix-dashboard/' as const

/**
 * Vue Router path that renders the iframe view embedding the Apisix
 * Dashboard inside the fdsc-dashboard shell.
 */
export const APISIX_DASHBOARD_ROUTE_PATH = '/apisix' as const

/**
 * Vue Router named-route identifier for the Apisix Dashboard view.
 */
export const APISIX_DASHBOARD_ROUTE_NAME = 'apisix-dashboard' as const

/**
 * Name of the Vite build-time environment variable that carries the
 * upstream Apisix Dashboard URL for local development.
 *
 * This constant exists for documentation purposes — the actual read
 * happens via `import.meta.env.VITE_APISIX_DASHBOARD_URL` in
 * {@link ../config.ts | loadApisixConfig}.
 */
export const BUILD_TIME_APISIX_URL_ENV_VAR = 'VITE_APISIX_DASHBOARD_URL' as const

/**
 * Field name inside the `window.__APISIX_CONFIG__` runtime-injected
 * global that carries the upstream URL string.
 *
 * At container start an nginx entrypoint renders a `/config.js` snippet
 * that sets `window.__APISIX_CONFIG__ = { upstreamUrl: "…" }`.
 */
export const RUNTIME_APISIX_CONFIG_KEY = 'upstreamUrl' as const

/**
 * Name of the global window property where a runtime configuration
 * script may inject the Apisix Dashboard configuration object.
 */
export const RUNTIME_APISIX_CONFIG_GLOBAL = '__APISIX_CONFIG__' as const

/**
 * Query parameter name used to pass the JWT to the BFF auth guard.
 *
 * Iframe `src` requests are plain browser navigations that cannot carry
 * custom HTTP headers. The frontend appends the token as this query
 * parameter; the BFF auth guard reads it, sets a session cookie for
 * subsequent requests, and the proxy strips it before forwarding.
 */
export const APISIX_AUTH_TOKEN_PARAM = '_auth_token' as const
