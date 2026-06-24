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
 * Tracing (Grafana Explore) integration constants.
 *
 * Centralises every path, route name, and configuration key used by the
 * embedded Grafana Explore view so that the proxy config, the Vue router,
 * the iframe view, and the test fixtures share a single source of truth.
 */

/**
 * Vue Router path that renders the Grafana Explore tracing view inside
 * the fdsc-dashboard shell.
 */
export const TRACING_ROUTE_PATH = '/tracing' as const

/**
 * Vue Router named-route identifier for the tracing view.
 */
export const TRACING_ROUTE_NAME = 'tracing' as const

/**
 * Grafana Explore sub-path appended to the iframe base URL.
 */
export const GRAFANA_EXPLORE_PATH = '/explore' as const

/**
 * Default Grafana organisation ID used in the Explore URL.
 */
export const DEFAULT_ORG_ID = 1

/**
 * Name of the global window property where the BFF runtime configuration
 * script (`/config.js`) injects the tracing configuration object.
 */
export const RUNTIME_TRACING_CONFIG_GLOBAL = '__TRACING_CONFIG__' as const

/**
 * Field name inside the `window.__TRACING_CONFIG__` runtime-injected
 * global that carries the Tempo datasource UID string.
 */
export const RUNTIME_TRACING_CONFIG_DATASOURCE_UID_KEY = 'datasourceUid' as const

/**
 * Name of the Vite build-time environment variable that carries the
 * Tempo datasource UID for local development.
 *
 * This constant exists for documentation purposes — the actual read
 * happens via `import.meta.env.VITE_GRAFANA_TEMPO_DATASOURCE_UID` in
 * {@link ../config.ts | loadTracingConfig}.
 */
export const BUILD_TIME_TEMPO_DATASOURCE_UID_ENV_VAR = 'VITE_GRAFANA_TEMPO_DATASOURCE_UID' as const
