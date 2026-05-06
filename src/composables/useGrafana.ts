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
 * Composable that exposes the Grafana Dashboard integration state.
 *
 * Encapsulates the visibility rule so that `App.vue`, `HomeView.vue`,
 * and any future consumer share a single, consistent predicate:
 *
 * - The Grafana entry is **visible** when the upstream URL is configured
 *   *and* the user is authenticated (or auth is disabled, preserving
 *   the legacy open-mode behaviour).
 * - When the upstream URL is not set the entry is hidden regardless of
 *   the user's authentication state.
 *
 * Unlike the Apisix Dashboard (which requires admin privileges), Grafana
 * panels are read-only monitoring views visible to **all authenticated
 * users** — not just admins.
 */

import { computed, type ComputedRef } from 'vue'
import { loadGrafanaConfig, isGrafanaConfigured } from '@/grafana/config'
import type { GrafanaConfig } from '@/grafana/types'
import { useAuth } from '@/composables/useAuth'

/**
 * Return type of {@link useGrafana}.
 */
export interface UseGrafanaResult {
  /** The resolved Grafana configuration. */
  readonly config: GrafanaConfig

  /** Whether the upstream URL is configured (non-null). */
  readonly isConfigured: boolean

  /**
   * Whether the Grafana section should be visible in the UI.
   *
   * `true` when the upstream URL is configured **and** the current user
   * is authenticated (or authentication is disabled).
   */
  readonly isVisible: ComputedRef<boolean>
}

/**
 * Reactive access to the Grafana Dashboard integration state.
 *
 * @returns A {@link UseGrafanaResult} containing the resolved config,
 *   a static `isConfigured` flag, and a reactive `isVisible` computed.
 */
export function useGrafana(): UseGrafanaResult {
  const config = loadGrafanaConfig()
  const configured = isGrafanaConfigured(config)
  const { isAuthEnabled, isAuthenticated } = useAuth()

  /**
   * The Grafana entry is visible when:
   * - The upstream URL is set (configured), **and**
   * - Auth is disabled (everyone is treated as authenticated), **or**
   *   the user is authenticated.
   *
   * Note: unlike Apisix (which requires admin role), Grafana panels
   * are read-only monitoring — any authenticated user may view them.
   */
  const isVisible: ComputedRef<boolean> = computed(
    () => configured && (!isAuthEnabled.value || isAuthenticated.value),
  )

  return { config, isConfigured: configured, isVisible }
}
