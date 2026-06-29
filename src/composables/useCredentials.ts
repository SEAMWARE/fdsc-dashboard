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
 * Composable that exposes the Verifiable Credentials status management state.
 *
 * The credentials tab is visible only when:
 * - The BFF has the Keycloak proxy configured (`KEYCLOAK_URL` is set).
 * - The user is authenticated via a Keycloak provider.
 * - The user holds the `realm-admin` role for either `realm-management`
 *   or `master-realm`.
 */

import { computed, type ComputedRef } from 'vue'
import { useAuth } from '@/composables/useAuth'

/** Window global name injected by the BFF runtime-config endpoint. */
const CREDENTIALS_CONFIG_GLOBAL = '__CREDENTIALS_CONFIG__'

/**
 * Read the credentials configuration from the runtime-injected window global.
 *
 * @returns `true` when the BFF has the Keycloak credential status proxy enabled.
 */
function isCredentialsProxyEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  const raw = (window as unknown as Record<string, unknown>)[CREDENTIALS_CONFIG_GLOBAL]
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return (raw as Record<string, unknown>).enabled === true
  }
  return false
}

/**
 * Return type of {@link useCredentials}.
 */
export interface UseCredentialsResult {
  /**
   * Whether the Verifiable Credentials tab should be visible in the UI.
   *
   * `true` when the BFF proxy is configured, the user is authenticated
   * via Keycloak, and has the `realm-admin` role.
   */
  readonly isVisible: ComputedRef<boolean>
}

/**
 * Reactive access to the Verifiable Credentials feature availability.
 *
 * @returns A {@link UseCredentialsResult} with a reactive `isVisible` computed.
 */
export function useCredentials(): UseCredentialsResult {
  const proxyEnabled = isCredentialsProxyEnabled()
  const { isRealmAdmin, isKeycloak } = useAuth()

  const isVisible: ComputedRef<boolean> = computed(
    () => proxyEnabled && isKeycloak.value && isRealmAdmin.value,
  )

  return { isVisible }
}
