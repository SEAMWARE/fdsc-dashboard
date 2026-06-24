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
 * Tracing (Grafana Explore) configuration loader.
 *
 * Produces a deterministic {@link TracingConfig} from two possible sources,
 * checked in priority order:
 *
 * 1. `window.__TRACING_CONFIG__.datasourceUid` — injected at container start
 *    by the BFF `/config.js` endpoint. This is the production path and lets
 *    operators reconfigure a built image purely through environment variables.
 * 2. `import.meta.env.VITE_GRAFANA_TEMPO_DATASOURCE_UID` — a string captured
 *    at Vite build time. This is the local-development fallback.
 *
 * When neither source yields a non-empty string the loader returns
 * `{ datasourceUid: null }` — meaning "Tracing not configured".
 * The navigation-drawer entry is hidden and the `/tracing` route renders
 * an informational alert instead of a broken iframe.
 *
 * The tracing feature additionally requires that the Grafana upstream URL
 * is configured (checked by the composable, not here) because the Explore
 * view is loaded through the Grafana BFF proxy or public iframe URL.
 */

import {
  BUILD_TIME_TEMPO_DATASOURCE_UID_ENV_VAR,
  RUNTIME_TRACING_CONFIG_GLOBAL,
  RUNTIME_TRACING_CONFIG_DATASOURCE_UID_KEY,
} from './constants'
import type { TracingConfig } from './types'

/** Frozen config returned when no datasource UID is configured. */
const UNCONFIGURED: TracingConfig = Object.freeze({ datasourceUid: null })

/**
 * Return `value` when it is a non-empty, non-whitespace-only string;
 * otherwise return `null`.
 *
 * @param value - the candidate string to validate.
 * @returns the trimmed string, or `null` if blank/missing.
 */
function nonBlank(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Attempt to read the datasource UID from the runtime-injected global.
 *
 * @returns the datasource UID string, or `null` when the global is absent
 *   or does not contain a usable value.
 */
function readRuntimeDatasourceUid(): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  const runtimeObj = (window as unknown as Record<string, unknown>)[
    RUNTIME_TRACING_CONFIG_GLOBAL
  ]
  if (runtimeObj === undefined || runtimeObj === null) {
    return null
  }
  if (typeof runtimeObj !== 'object' || Array.isArray(runtimeObj)) {
    return null
  }
  return nonBlank(
    (runtimeObj as Record<string, unknown>)[RUNTIME_TRACING_CONFIG_DATASOURCE_UID_KEY],
  )
}

/**
 * Attempt to read the datasource UID from the Vite build-time env var.
 *
 * @returns the datasource UID string, or `null` when the env var is absent
 *   or blank.
 */
function readBuildTimeDatasourceUid(): string | null {
  return nonBlank(import.meta.env[BUILD_TIME_TEMPO_DATASOURCE_UID_ENV_VAR])
}

/**
 * Load the effective tracing configuration for the current application
 * instance.
 *
 * Resolution order:
 * 1. `window.__TRACING_CONFIG__.datasourceUid` (runtime injection).
 * 2. `import.meta.env.VITE_GRAFANA_TEMPO_DATASOURCE_UID` (build-time env var).
 * 3. `null` (not configured).
 *
 * This function is pure (no side-effects) so it is safe to call from
 * tests with a stubbed `window` / `import.meta.env`.
 *
 * @returns a frozen {@link TracingConfig} — never `undefined`.
 */
export function loadTracingConfig(): TracingConfig {
  const uid = readRuntimeDatasourceUid() ?? readBuildTimeDatasourceUid()
  if (uid === null) {
    return UNCONFIGURED
  }
  return Object.freeze({ datasourceUid: uid })
}

/**
 * Whether the supplied config has a non-null datasource UID, meaning the
 * tracing integration is active (assuming Grafana is also configured).
 *
 * @param config - a {@link TracingConfig}, typically obtained from
 *   {@link loadTracingConfig}.
 * @returns `true` when the datasource UID is configured.
 */
export function isTracingConfigured(config: TracingConfig): boolean {
  return config.datasourceUid !== null
}
