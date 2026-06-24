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
 * Composable that exposes the Grafana Explore / Tracing integration state.
 *
 * Encapsulates the visibility rule so that `App.vue`, `HomeView.vue`,
 * and any future consumer share a single, consistent predicate:
 *
 * - The tracing entry is **visible** when the Tempo datasource UID is
 *   configured, the Grafana upstream is available, *and* the user has the
 *   admin role (or auth is disabled, preserving the legacy open-mode
 *   behaviour).
 * - When either the datasource UID or Grafana URL is not set the entry
 *   is hidden regardless of the user's role.
 */

import { computed, type ComputedRef } from 'vue'
import { loadTracingConfig, isTracingConfigured } from '@/tracing/config'
import { loadGrafanaConfig, isGrafanaConfigured } from '@/grafana/config'
import type { TracingConfig } from '@/tracing/types'
import type { GrafanaConfig } from '@/grafana/types'
import { useAuth } from '@/composables/useAuth'

/**
 * Return type of {@link useTracing}.
 */
export interface UseTracingResult {
  /** The resolved tracing configuration. */
  readonly tracingConfig: TracingConfig

  /** The resolved Grafana configuration (needed for iframe URL construction). */
  readonly grafanaConfig: GrafanaConfig

  /** Whether both the datasource UID and Grafana URL are configured. */
  readonly isConfigured: boolean

  /**
   * Whether the tracing entry should be visible in the UI.
   *
   * `true` when the datasource UID and Grafana URL are configured
   * **and** the current user has admin privileges (or authentication
   * is disabled).
   */
  readonly isVisible: ComputedRef<boolean>
}

/**
 * Reactive access to the Grafana Explore / Tracing integration state.
 *
 * @returns A {@link UseTracingResult} containing the resolved configs,
 *   a static `isConfigured` flag, and a reactive `isVisible` computed.
 */
export function useTracing(): UseTracingResult {
  const tracingConfig = loadTracingConfig()
  const grafanaConfig = loadGrafanaConfig()
  const configured = isTracingConfigured(tracingConfig) && isGrafanaConfigured(grafanaConfig)
  const { isAuthEnabled, isAdmin } = useAuth()

  /**
   * The tracing entry is visible when:
   * - Both the datasource UID and Grafana URL are set (configured), **and**
   * - Auth is disabled (everyone is treated as admin), **or** the user
   *   has the admin role.
   */
  const isVisible: ComputedRef<boolean> = computed(
    () => configured && (!isAuthEnabled.value || isAdmin.value),
  )

  return { tracingConfig, grafanaConfig, isConfigured: configured, isVisible }
}
