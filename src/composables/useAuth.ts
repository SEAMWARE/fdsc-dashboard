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
import { computed, ref, type ComputedRef } from 'vue'

import { useAuthStore } from '@/stores/auth'

/** localStorage key for persisting the current JWT. */
export const AUTH_TOKEN_STORAGE_KEY = 'fdsc-dashboard-auth-token'

/**
 * Name of the build-time environment variable that may seed the JWT.
 * Exported for documentation purposes only; the value is read via
 * `import.meta.env.VITE_AUTH_TOKEN` so Vite's static replacement works.
 */
export const AUTH_TOKEN_ENV_KEY = 'VITE_AUTH_TOKEN'

/**
 * Reactive holder for the current JWT. An empty string means no token is
 * currently configured. Declared at module scope so every caller of
 * `useAuth()` observes the same state.
 */
const tokenState = ref<string>('')

/**
 * Lazily resolve the auth Pinia store, returning `null` when Pinia is
 * not installed (e.g. in token-only unit tests that never call
 * `setActivePinia`). This keeps the composable usable from both the
 * token-based flow and the OAuth2 flow without forcing every consumer
 * to install Pinia first.
 */
function safeUseAuthStore(): ReturnType<typeof useAuthStore> | null {
  try {
    return useAuthStore()
  } catch {
    return null
  }
}

/**
 * Combined reactive access helpers returned by {@link useAuth}.
 *
 * The composable exposes two complementary APIs in a single object:
 *
 * - **Token-based** (`token`, `isAuthenticated`, `setToken`, `clearToken`,
 *   `initAuth`, `getAuthTokenSync`) — the build-time / localStorage JWT
 *   used by the generated API-client bearer-token resolver.
 * - **Role-based** (`isAdmin`, `isViewer`, `canEdit`, `canDelete`,
 *   `isAuthEnabled`) — mirrors the OAuth2 auth Pinia store so views can
 *   gate the UI on the signed-in user's role. When auth is disabled
 *   (no OAuth2 providers configured) every role flag defaults to `true`
 *   so the dashboard keeps its legacy open-mode behaviour.
 */
export interface UseAuthResult {
  readonly token: ComputedRef<string>
  readonly isAuthenticated: ComputedRef<boolean>
  readonly isAdmin: ComputedRef<boolean>
  readonly isViewer: ComputedRef<boolean>
  readonly canEdit: ComputedRef<boolean>
  readonly canDelete: ComputedRef<boolean>
  readonly isAuthEnabled: ComputedRef<boolean>
  setToken: (value: string) => void
  clearToken: () => void
  initAuth: () => void
  getAuthTokenSync: () => string
}

/**
 * Public, reactive API for the application's authentication state.
 *
 * @returns The combined {@link UseAuthResult} covering both the JWT
 *   bearer-token flow and the OAuth2 role-based capability flags.
 */
export function useAuth(): UseAuthResult {
  const store = safeUseAuthStore()

  /**
   * The current JWT as a reactive computed ref. Empty when unauthenticated.
   * Falls back to the OIDC access token when the legacy token state is empty.
   */
  const token: ComputedRef<string> = computed(
    () => tokenState.value || store?.accessToken || '',
  )

  /** `true` iff at least one OAuth2 provider is configured. */
  const isAuthEnabled: ComputedRef<boolean> = computed(() =>
    store ? store.isAuthEnabled : false,
  )

  /**
   * Whether the user is currently "signed in".
   *
   * - When OAuth2 auth is enabled the flag follows the Pinia store.
   * - When auth is disabled we fall back to the classic token-based
   *   semantics: a non-empty JWT means authenticated.
   */
  const isAuthenticated: ComputedRef<boolean> = computed(() => {
    if (store && store.isAuthEnabled) {
      return store.isAuthenticated
    }
    return tokenState.value.length > 0
  })

  /**
   * Whether the signed-in user has the canonical admin role. Returns
   * `true` when auth is disabled so the dashboard remains fully
   * operable in open mode.
   */
  const isAdmin: ComputedRef<boolean> = computed(() => {
    if (!store || !store.isAuthEnabled) {
      return true
    }
    return store.isAdmin
  })

  /** Whether the signed-in user has at least viewer privileges. */
  const isViewer: ComputedRef<boolean> = computed(() => {
    if (!store || !store.isAuthEnabled) {
      return true
    }
    return store.isViewer
  })

  /** Whether the signed-in user may create or edit resources. */
  const canEdit: ComputedRef<boolean> = computed(() => isAdmin.value)

  /** Whether the signed-in user may delete resources. */
  const canDelete: ComputedRef<boolean> = computed(() => isAdmin.value)

  /**
   * Replace the current JWT. Whitespace is trimmed. Non-empty values are
   * persisted to `localStorage`; empty values remove the stored entry.
   *
   * @param value - The new JWT, or an empty string to clear the token.
   */
  function setToken(value: string): void {
    const trimmed = value.trim()
    tokenState.value = trimmed
    if (trimmed.length > 0) {
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, trimmed)
    } else {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    }
  }

  /** Clear the current JWT. Equivalent to `setToken('')`. */
  function clearToken(): void {
    setToken('')
  }

  /**
   * Initialise the token state. Resolution order:
   *   1. `localStorage` entry under {@link AUTH_TOKEN_STORAGE_KEY}.
   *   2. `import.meta.env.VITE_AUTH_TOKEN` when non-empty.
   *   3. No-op (token stays empty).
   */
  function initAuth(): void {
    const stored = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
    if (stored && stored.length > 0) {
      tokenState.value = stored
      return
    }
    const fromEnv = import.meta.env.VITE_AUTH_TOKEN
    if (typeof fromEnv === 'string' && fromEnv.length > 0) {
      tokenState.value = fromEnv
      return
    }
    tokenState.value = ''
  }

  return {
    token,
    isAuthenticated,
    isAdmin,
    isViewer,
    canEdit,
    canDelete,
    isAuthEnabled,
    setToken,
    clearToken,
    initAuth,
    getAuthTokenSync,
  }
}

/**
 * Non-reactive accessor for the current JWT. Safe to call from outside a
 * component setup context (e.g. from the generated API-client token resolver).
 *
 * @returns The current JWT, or an empty string when unauthenticated.
 */
export function getAuthTokenSync(): string {
  return tokenState.value
}
