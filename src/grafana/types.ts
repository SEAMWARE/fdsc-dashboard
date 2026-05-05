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
 * Type definitions for the Grafana Dashboard integration.
 *
 * The configuration tells fdsc-dashboard whether an upstream Grafana
 * instance is available and, if so, which panels to embed as iframes.
 * Panel definitions are operator-configurable via the
 * `GRAFANA_PANELS_JSON` environment variable.
 */

/**
 * A single Grafana panel to embed as an iframe.
 *
 * Each panel maps to one `<iframe>` in the Grafana view's responsive
 * grid layout.
 */
export interface GrafanaPanel {
  /** Display title rendered above the iframe. */
  readonly title: string
  /** Grafana URL path (e.g. `/d-solo/uid/slug?panelId=1&kiosk`). */
  readonly path: string
  /** Vuetify grid column span (1–12). Defaults to 6 (half-width). */
  readonly span?: number
  /** Iframe height in pixels. Defaults to 400. */
  readonly height?: number
}

/**
 * Resolved configuration for the embedded Grafana Dashboards.
 *
 * When {@link upstreamUrl} is `null` the integration is considered
 * unconfigured: the navigation-drawer entry is hidden and the `/grafana`
 * route renders a "not configured" informational alert instead of
 * iframe panels.
 */
export interface GrafanaConfig {
  /** Upstream Grafana URL, or `null` when not configured. */
  readonly upstreamUrl: string | null
  /** Public URL for embedding Grafana in iframes, or `null` to use the BFF proxy. */
  readonly iframeUrl: string | null
  /** Array of panel definitions to embed. */
  readonly panels: readonly GrafanaPanel[]
}
