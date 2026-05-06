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
 * Grafana Dashboard configuration loader.
 *
 * Produces a deterministic {@link GrafanaConfig} from two possible sources,
 * checked in priority order:
 *
 * 1. `window.__GRAFANA_CONFIG__` — injected at container start by the
 *    BFF `/config.js` endpoint. Contains both the upstream URL and the
 *    panels array. This is the production path and lets operators
 *    reconfigure a built image purely through environment variables.
 * 2. `import.meta.env.VITE_GRAFANA_URL` — a string captured at Vite
 *    build time. This is the local-development fallback so contributors
 *    can set the env var and `npm run dev` without also standing up the
 *    BFF. Note: no panels are available in this mode (empty array).
 *
 * When neither source yields a non-empty URL the loader returns
 * `{ upstreamUrl: null, panels: [] }` — meaning "Grafana not configured".
 * The navigation-drawer entry is hidden and the `/grafana` route renders
 * an informational alert instead of iframe panels.
 */

import {
  BUILD_TIME_GRAFANA_URL_ENV_VAR,
  RUNTIME_GRAFANA_CONFIG_GLOBAL,
  RUNTIME_GRAFANA_CONFIG_IFRAME_URL_KEY,
  RUNTIME_GRAFANA_CONFIG_PANELS_KEY,
  RUNTIME_GRAFANA_CONFIG_URL_KEY,
} from './constants'
import type { GrafanaConfig, GrafanaPanel } from './types'

/** Frozen config returned when no upstream URL is configured. */
const UNCONFIGURED: GrafanaConfig = Object.freeze({ upstreamUrl: null, iframeUrl: null, panels: [] })

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
 * Validate and freeze an array of panel definitions from the runtime
 * config. Each element must have at least a `title` (string) and `path`
 * (string). Invalid entries are silently dropped.
 *
 * @param raw - the raw panels value from the runtime config global.
 * @returns a frozen array of validated {@link GrafanaPanel} objects.
 */
function parsePanels(raw: unknown): readonly GrafanaPanel[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const panels: GrafanaPanel[] = []
  for (const item of raw) {
    if (
      item !== null &&
      typeof item === 'object' &&
      typeof (item as Record<string, unknown>).title === 'string' &&
      typeof (item as Record<string, unknown>).path === 'string'
    ) {
      const panel: GrafanaPanel = {
        title: (item as Record<string, unknown>).title as string,
        path: (item as Record<string, unknown>).path as string,
        ...(typeof (item as Record<string, unknown>).span === 'number'
          ? { span: (item as Record<string, unknown>).span as number }
          : {}),
        ...(typeof (item as Record<string, unknown>).height === 'number'
          ? { height: (item as Record<string, unknown>).height as number }
          : {}),
      }
      panels.push(panel)
    }
  }
  return Object.freeze(panels)
}

/**
 * Attempt to read the Grafana configuration from the runtime-injected
 * global (`window.__GRAFANA_CONFIG__`).
 *
 * @returns a frozen {@link GrafanaConfig} if the global contains a
 *   usable upstream URL, or `null` when the global is absent or does
 *   not contain a valid configuration.
 */
function readRuntimeConfig(): GrafanaConfig | null {
  if (typeof window === 'undefined') {
    return null
  }
  const runtimeObj = (window as unknown as Record<string, unknown>)[
    RUNTIME_GRAFANA_CONFIG_GLOBAL
  ]
  if (runtimeObj === undefined || runtimeObj === null) {
    return null
  }
  if (typeof runtimeObj !== 'object' || Array.isArray(runtimeObj)) {
    return null
  }
  const url = nonBlank(
    (runtimeObj as Record<string, unknown>)[RUNTIME_GRAFANA_CONFIG_URL_KEY],
  )
  const iframeUrl = nonBlank(
    (runtimeObj as Record<string, unknown>)[RUNTIME_GRAFANA_CONFIG_IFRAME_URL_KEY],
  )
  if (url === null && iframeUrl === null) {
    return null
  }
  const panels = parsePanels(
    (runtimeObj as Record<string, unknown>)[RUNTIME_GRAFANA_CONFIG_PANELS_KEY],
  )
  return Object.freeze({ upstreamUrl: url, iframeUrl, panels })
}

/**
 * Attempt to read the upstream URL from the Vite build-time env var.
 * No panels are available in this mode — only the URL.
 *
 * @returns a frozen {@link GrafanaConfig} with the URL and empty panels,
 *   or `null` when the env var is absent or blank.
 */
function readBuildTimeConfig(): GrafanaConfig | null {
  const url = nonBlank(import.meta.env[BUILD_TIME_GRAFANA_URL_ENV_VAR])
  if (url === null) {
    return null
  }
  return Object.freeze({ upstreamUrl: url, iframeUrl: null, panels: [] })
}

/**
 * Load the effective Grafana configuration for the current application
 * instance.
 *
 * Resolution order:
 * 1. `window.__GRAFANA_CONFIG__` (runtime injection — URL + panels).
 * 2. `import.meta.env.VITE_GRAFANA_URL` (build-time env var — URL only).
 * 3. `null` (not configured).
 *
 * This function is pure (no side-effects) so it is safe to call from
 * tests with a stubbed `window` / `import.meta.env`.
 *
 * @returns a frozen {@link GrafanaConfig} — never `undefined`.
 */
export function loadGrafanaConfig(): GrafanaConfig {
  return readRuntimeConfig() ?? readBuildTimeConfig() ?? UNCONFIGURED
}

/**
 * Whether the monitoring dashboard integration is active.
 *
 * The feature is enabled when either the upstream Grafana URL (for BFF
 * proxying) or the public iframe URL (for direct embedding) is configured.
 *
 * @param config - a {@link GrafanaConfig}, typically obtained from
 *   {@link loadGrafanaConfig}.
 * @returns `true` when at least one Grafana URL is configured and the
 *   monitoring section should be shown.
 */
export function isGrafanaConfigured(config: GrafanaConfig): boolean {
  return config.upstreamUrl !== null || config.iframeUrl !== null
}
