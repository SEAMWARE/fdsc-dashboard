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
 * BFF server configuration module.
 *
 * Reads all configuration from environment variables with sensible defaults.
 * This module is the single source of truth for server configuration —
 * no other module should read env vars directly.
 */

import { type LogLevel, parseLogLevel } from './logger.js'

/** Default port the BFF server listens on. */
const DEFAULT_PORT = 3000

/** Default auth configuration JSON served to the browser. */
const DEFAULT_AUTH_CONFIG_JSON = '{"providers":[]}'

/** Default Grafana panels JSON when no panels are configured. */
const DEFAULT_GRAFANA_PANELS_JSON = '[]'

/** Default directory for serving static frontend assets (relative to server root). */
const DEFAULT_STATIC_DIR = '../dist'

/**
 * Application configuration derived from environment variables.
 *
 * All downstream service URLs point to internal network addresses
 * that are not directly accessible from the browser. An empty string
 * means the service is not configured and its UI section will be hidden.
 */
export interface AppConfig {
  /** Port the BFF server listens on. */
  port: number
  /** Upstream URL for the Trusted Issuers List API (empty = disabled). */
  tilApiUrl: string
  /** Upstream URL for the Trusted Issuers Registry API (empty = disabled). */
  tirApiUrl: string
  /** Upstream URL for the Credentials Config Service API (empty = disabled). */
  ccsApiUrl: string
  /** Upstream URL for the ODRL Policy API (empty = disabled). */
  odrlApiUrl: string
  /** JSON string with OAuth2/OIDC provider configuration for the browser. */
  authConfigJson: string
  /** Directory from which static frontend assets are served. */
  staticDir: string
  /** Upstream URL for the Apisix Dashboard (empty = disabled). */
  apisixDashboardUrl: string
  /** API key for the Apisix Admin API, injected by the proxy (empty = no key). */
  apisixAdminApiKey: string
  /** Minimum log severity level for the BFF server. */
  logLevel: LogLevel
  /** Upstream URL for the Grafana instance (empty = disabled). */
  grafanaUrl: string
  /** Public URL for embedding Grafana in iframes (empty = use BFF proxy). */
  grafanaIframeUrl: string
  /** JSON string defining Grafana panel embeddings. */
  grafanaPanelsJson: string
}

/**
 * Per-service availability flags exposed to the frontend.
 *
 * A service is considered enabled when its upstream URL is configured
 * (non-empty). The frontend uses this to hide navigation tabs and
 * route guards for services that are not available.
 */
export interface ServicesConfig {
  /** Whether the Trusted Issuers List service is available. */
  til: boolean
  /** Whether the Trusted Issuers Registry service is available. */
  tir: boolean
  /** Whether the Credentials Config Service is available. */
  ccs: boolean
  /** Whether the ODRL Policy service is available. */
  odrl: boolean
}

/**
 * Apisix Dashboard configuration exposed to the frontend.
 *
 * Unlike regular services (which are proxied through the BFF), the Apisix
 * Dashboard is an external URL opened via iframe or link. The frontend
 * reads this from `window.__APISIX_CONFIG__` to decide whether to show the
 * navigation entry and which URL to embed.
 */
export interface ApisixConfig {
  /** Upstream URL for the Apisix Dashboard, or `null` when not configured. */
  upstreamUrl: string | null
}

/**
 * Derives per-service availability flags from the application configuration.
 *
 * A service is enabled when its upstream URL is a non-empty string.
 *
 * @param config - Application configuration with upstream service URLs
 * @returns Object indicating which services are enabled
 */
export function getEnabledServices(config: AppConfig): ServicesConfig {
  return {
    til: config.tilApiUrl !== '',
    tir: config.tirApiUrl !== '',
    ccs: config.ccsApiUrl !== '',
    odrl: config.odrlApiUrl !== '',
  }
}

/**
 * Derives the Apisix Dashboard configuration from the application configuration.
 *
 * Returns the upstream URL when configured, or `null` when the env var is
 * absent or empty — the frontend hides the navigation entry in that case.
 *
 * @param config - Application configuration containing the Apisix Dashboard URL
 * @returns Apisix configuration with upstream URL or null
 */
export function getApisixConfig(config: AppConfig): ApisixConfig {
  return {
    upstreamUrl: config.apisixDashboardUrl !== '' ? config.apisixDashboardUrl : null,
  }
}

/**
 * Defines a single Grafana panel to embed in the dashboard.
 *
 * Each panel is rendered as an iframe pointing to a Grafana solo-panel URL.
 * Operators configure these via the `GRAFANA_PANELS_JSON` environment variable.
 */
export interface GrafanaPanel {
  /** Display title rendered above the iframe. */
  title: string
  /** Grafana URL path (e.g. `/d-solo/uid/slug?panelId=1&kiosk`). */
  path: string
  /** Vuetify grid column span (1–12). Defaults to 6 (half-width). */
  span?: number
  /** Iframe height in pixels. Defaults to 400. */
  height?: number
}

/**
 * Grafana configuration exposed to the frontend via `window.__GRAFANA_CONFIG__`.
 *
 * The frontend uses this to decide whether to show the Grafana section
 * and which panels to render.
 */
export interface GrafanaConfig {
  /** Upstream Grafana URL, or `null` when not configured. */
  upstreamUrl: string | null
  /** Public URL for embedding Grafana in iframes, or `null` to use the BFF proxy. */
  iframeUrl: string | null
  /** Array of panel definitions to embed. */
  panels: GrafanaPanel[]
}

/**
 * Derives the Grafana configuration from the application configuration.
 *
 * When `grafanaUrl` is empty, returns `null` upstream and an empty panels array
 * so the frontend hides the Grafana section entirely. Malformed JSON in
 * `grafanaPanelsJson` falls back to an empty array with a console warning.
 *
 * @param config - Application configuration containing Grafana settings
 * @returns Grafana configuration with upstream URL and parsed panels
 */
export function getGrafanaConfig(config: AppConfig): GrafanaConfig {
  if (config.grafanaUrl === '') {
    return { upstreamUrl: null, iframeUrl: null, panels: [] }
  }

  let panels: GrafanaPanel[] = []
  try {
    panels = JSON.parse(config.grafanaPanelsJson) as GrafanaPanel[]
    if (!Array.isArray(panels)) {
      console.warn(
        '[config] GRAFANA_PANELS_JSON is not a JSON array, falling back to empty panels',
      )
      panels = []
    }
  } catch {
    console.warn(
      '[config] GRAFANA_PANELS_JSON contains invalid JSON, falling back to empty panels',
    )
    panels = []
  }

  return {
    upstreamUrl: config.grafanaUrl,
    iframeUrl: config.grafanaIframeUrl !== '' ? config.grafanaIframeUrl : null,
    panels,
  }
}

/**
 * Parses the PORT environment variable into a valid port number.
 *
 * Returns the default port if the value is missing, empty, or not a valid
 * integer in the range 1–65535.
 *
 * @param value - Raw string value from the environment variable
 * @returns A valid port number
 */
export function parsePort(value: string | undefined): number {
  if (!value) {
    return DEFAULT_PORT
  }
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
    return DEFAULT_PORT
  }
  return parsed
}

/**
 * Loads application configuration from environment variables.
 *
 * Each setting has a sensible default so the server can start without
 * any explicit configuration (useful for local development).
 *
 * @param env - Environment variable map (defaults to `process.env`)
 * @returns Fully resolved application configuration
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  return {
    port: parsePort(env.PORT),
    tilApiUrl: env.TIL_API_URL || '',
    tirApiUrl: env.TIR_API_URL || '',
    ccsApiUrl: env.CCS_API_URL || '',
    odrlApiUrl: env.ODRL_API_URL || '',
    apisixDashboardUrl: env.APISIX_DASHBOARD_URL || '',
    apisixAdminApiKey: env.APISIX_ADMIN_API_KEY || '',
    authConfigJson: env.AUTH_CONFIG_JSON || DEFAULT_AUTH_CONFIG_JSON,
    staticDir: env.STATIC_DIR || DEFAULT_STATIC_DIR,
    logLevel: parseLogLevel(env.LOG_LEVEL),
    grafanaUrl: env.GRAFANA_URL || '',
    grafanaIframeUrl: env.GRAFANA_IFRAME_URL || '',
    grafanaPanelsJson: env.GRAFANA_PANELS_JSON || DEFAULT_GRAFANA_PANELS_JSON,
  }
}
