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
 * Grafana Dashboard integration constants.
 *
 * Centralises every path, route name, and configuration key used by the
 * embedded Grafana panels so that the proxy config, the Vue router, the
 * iframe view, and the test fixtures share a single source of truth.
 */

/**
 * Vue Router path that renders the Grafana panels view inside the
 * fdsc-dashboard shell.
 */
export const GRAFANA_ROUTE_PATH = '/grafana' as const

/**
 * Vue Router named-route identifier for the Grafana Dashboards view.
 */
export const GRAFANA_ROUTE_NAME = 'grafana-dashboards' as const

/**
 * On-origin base path at which the BFF reverse proxy mounts the
 * upstream Grafana instance. Requests to `/api/grafana/*` are forwarded
 * to the Grafana upstream with the prefix stripped.
 */
export const GRAFANA_PROXY_BASE_PATH = '/api/grafana' as const

/**
 * Name of the global window property where the BFF runtime configuration
 * script (`/config.js`) injects the Grafana configuration object.
 */
export const RUNTIME_GRAFANA_CONFIG_GLOBAL = '__GRAFANA_CONFIG__' as const

/**
 * Field name inside the `window.__GRAFANA_CONFIG__` runtime-injected
 * global that carries the upstream URL string.
 */
export const RUNTIME_GRAFANA_CONFIG_URL_KEY = 'upstreamUrl' as const

/**
 * Field name inside the `window.__GRAFANA_CONFIG__` runtime-injected
 * global that carries the public iframe URL string.
 */
export const RUNTIME_GRAFANA_CONFIG_IFRAME_URL_KEY = 'iframeUrl' as const

/**
 * Field name inside the `window.__GRAFANA_CONFIG__` runtime-injected
 * global that carries the panels array.
 */
export const RUNTIME_GRAFANA_CONFIG_PANELS_KEY = 'panels' as const

/**
 * Name of the Vite build-time environment variable that carries the
 * upstream Grafana URL for local development.
 *
 * This constant exists for documentation purposes — the actual read
 * happens via `import.meta.env.VITE_GRAFANA_URL` in
 * {@link ../config.ts | loadGrafanaConfig}.
 */
export const BUILD_TIME_GRAFANA_URL_ENV_VAR = 'VITE_GRAFANA_URL' as const

/**
 * Query parameter name used to pass the JWT to the BFF Grafana proxy.
 *
 * Iframe `src` requests are plain browser navigations that cannot carry
 * custom HTTP headers. The frontend appends the token as this query
 * parameter; the BFF proxy strips it before forwarding to Grafana and
 * uses it to set the `X-WEBAUTH-USER` auth proxy header instead.
 */
export const GRAFANA_AUTH_TOKEN_PARAM = '_auth_token' as const
