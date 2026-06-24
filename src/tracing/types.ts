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
 * Type definitions for the Grafana Explore / Tracing integration.
 *
 * The configuration tells fdsc-dashboard whether a Tempo datasource is
 * available for trace exploration inside the embedded Grafana Explore view.
 */

/**
 * Resolved configuration for the embedded tracing (Grafana Explore) view.
 *
 * When {@link datasourceUid} is `null` the integration is considered
 * unconfigured: the navigation-drawer entry is hidden and the `/tracing`
 * route renders a "not configured" informational alert instead of an iframe.
 */
export interface TracingConfig {
  /** Grafana Tempo datasource UID used to pre-select the datasource in Explore, or `null` when unconfigured. */
  readonly datasourceUid: string | null
}
