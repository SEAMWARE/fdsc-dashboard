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
 * Pinia store for OAuth2 / OpenID Connect authentication state.
 *
 * Owns the runtime authentication lifecycle of the dashboard:
 *
 * - Reads the provider configuration via {@link loadAuthConfig}.
 * - Restores the signed-in user from the OIDC client's storage on app
 *   start via {@link useAuthStore.init}.
 * - Initiates the authorisation-code flow via {@link useAuthStore.login}.
 * - Handles the redirect callback, exchanges the authorisation code for
 *   tokens, and maps the ID-token claims onto an {@link AuthenticatedUser}
 *   via {@link useAuthStore.handleCallback}.
 * - Terminates the session via {@link useAuthStore.logout}.
 *
 * When the loaded config contains zero providers the store reports
 * `isAuthEnabled === false` and the router guard / UI gating treat the
 * user as an admin so the dashboard continues to work unauthenticated.
 *
 * Role resolution follows the provider's `rolesClaimPath` (defaults to
 * `realm_access.roles` — Keycloak style), applies the optional
 * `roleMapping` translation, and falls back to {@link ROLE_VIEWER} when
 * no matching role is present in the token. Admin is preferred over
 * viewer whenever both are found.
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { User } from 'oidc-client-ts'

import { getProviderById, isAuthEnabled, loadAuthConfig } from '@/auth/config'
import {
  DEFAULT_ROLES_CLAIM_PATH,
  ROLE_ADMIN,
  ROLE_VIEWER,
} from '@/auth/constants'
import {
  getUser as oidcGetUser,
  removeUser as oidcRemoveUser,
  signinRedirect as oidcSigninRedirect,
  signinRedirectCallback as oidcSigninRedirectCallback,
  signoutRedirect as oidcSignoutRedirect,
} from '@/auth/oidcClient'
import type {
  AuthConfig,
  AuthenticatedUser,
  OAuthProviderConfig,
  Role,
} from '@/auth/types'

/** Lifecycle states exposed to the UI via the store's `status` field. */
export type AuthStatus =
  | 'idle'
  | 'authenticating'
  | 'authenticated'
  | 'error'

/** Initial value of {@link useAuthStore.status} before any action runs. */
const INITIAL_STATUS: AuthStatus = 'idle'

/**
 * Fallback display name used when neither the `name` nor the
 * `preferred_username` claim is present on the ID token.
 */
const UNKNOWN_USER_DISPLAY_NAME = 'Unknown user'

/**
 * Parse a claim path into an ordered list of property-name segments.
 *
 * Supports two notations that can be mixed freely:
 *
 * - **Dot notation** — `realm_access.roles` → `["realm_access", "roles"]`.
 * - **Bracket notation** — `resource_access[did:web:x.org].roles`
 *   → `["resource_access", "did:web:x.org", "roles"]`.
 *
 * Brackets allow property names that contain dots (e.g. DID-style
 * client IDs) to be used as a single segment.
 *
 * @param path - claim path string.
 * @returns ordered array of property-name segments.
 */
export function parseClaimPath(path: string): string[] {
  const segments: string[] = []
  let i = 0
  while (i < path.length) {
    if (path[i] === '.') {
      i++
      continue
    }
    if (path[i] === '[') {
      const close = path.indexOf(']', i + 1)
      if (close === -1) {
        segments.push(path.substring(i + 1))
        break
      }
      const key = path.substring(i + 1, close)
      if (key.length > 0) {
        segments.push(key)
      }
      i = close + 1
      continue
    }
    let end = i
    while (end < path.length && path[end] !== '.' && path[end] !== '[') {
      end++
    }
    const key = path.substring(i, end)
    if (key.length > 0) {
      segments.push(key)
    }
    i = end
  }
  return segments
}

/**
 * Walk a claim path on a JSON-like object and return the value at that
 * path, or `undefined` if any segment is missing or not an object.
 *
 * Supports both dot notation (`realm_access.roles`) and bracket notation
 * (`resource_access[did:web:mp-operations.org].roles`) for property names
 * that contain dots.
 *
 * @param source - claims object to walk.
 * @param path - claim path, e.g. `"resource_access[did:web:x.org].roles"`.
 */
function readClaimPath(source: unknown, path: string): unknown {
  if (source === null || source === undefined) {
    return undefined
  }
  const segments = parseClaimPath(path)
  let cursor: unknown = source
  for (const segment of segments) {
    if (
      cursor === null ||
      cursor === undefined ||
      typeof cursor !== 'object' ||
      Array.isArray(cursor)
    ) {
      return undefined
    }
    cursor = (cursor as Record<string, unknown>)[segment]
  }
  return cursor
}

/**
 * Segment of a Keycloak issuer URL that identifies it as Keycloak.
 * Keycloak issuers follow the pattern `{base}/realms/{realm}`.
 */
const KEYCLOAK_REALM_SEGMENT = '/realms/'

/**
 * Keycloak resource-access client names whose `realm-admin` role
 * grants access to the credential status admin API.
 */
const REALM_ADMIN_CLIENTS = ['realm-management', 'master-realm'] as const

/** Keycloak role granting credential status admin access. */
const REALM_ADMIN_ROLE = 'realm-admin'

/**
 * Decode a JWT payload in the browser without verifying the signature.
 *
 * The token is trusted because it was issued by the OIDC provider and
 * the guard only needs to read the claims for UI gating.
 *
 * @param token - Raw JWT string (without the `Bearer ` prefix).
 * @returns Decoded payload object, or `null` when the token is malformed.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) {
    return null
  }
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64)) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Check whether a decoded JWT contains the `realm-admin` role for one of
 * the Keycloak clients that manage the realm (`realm-management` or
 * `master-realm`).
 *
 * @param claims - Decoded JWT payload.
 * @returns `true` when the token carries the required realm-admin role.
 */
function hasRealmAdminRole(claims: Record<string, unknown>): boolean {
  const resourceAccess = claims.resource_access
  if (!resourceAccess || typeof resourceAccess !== 'object' || Array.isArray(resourceAccess)) {
    return false
  }
  const ra = resourceAccess as Record<string, unknown>
  for (const client of REALM_ADMIN_CLIENTS) {
    const clientAccess = ra[client]
    if (!clientAccess || typeof clientAccess !== 'object' || Array.isArray(clientAccess)) {
      continue
    }
    const roles = (clientAccess as Record<string, unknown>).roles
    if (Array.isArray(roles) && roles.includes(REALM_ADMIN_ROLE)) {
      return true
    }
  }
  return false
}

/**
 * Extract the Keycloak realm name from an issuer URL.
 *
 * Keycloak issuers follow the pattern `{base}/realms/{realm}`. Returns
 * `null` when the URL does not match this pattern.
 *
 * @param issuer - The OIDC issuer URL.
 * @returns The realm name, or `null`.
 */
function extractKeycloakRealm(issuer: string): string | null {
  const idx = issuer.indexOf(KEYCLOAK_REALM_SEGMENT)
  if (idx === -1) {
    return null
  }
  const afterRealms = issuer.substring(idx + KEYCLOAK_REALM_SEGMENT.length)
  const slashIdx = afterRealms.indexOf('/')
  return slashIdx === -1 ? afterRealms : afterRealms.substring(0, slashIdx)
}

/**
 * Coerce the value at the resolved claim path into an array of role
 * strings. Accepts:
 *
 * - An array of strings (taken as-is).
 * - A single string, which is split on whitespace — matches the OAuth2
 *   `scope` convention some providers use for roles.
 * - Anything else → empty array.
 */
function normaliseRawRoles(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((r): r is string => typeof r === 'string')
  }
  if (typeof raw === 'string') {
    return raw.split(/\s+/).filter((r) => r.length > 0)
  }
  return []
}

/**
 * Resolve the canonical {@link Role} for a user given a provider's
 * configuration and the ID-token claims.
 *
 * Precedence:
 * 1. Walk `provider.rolesClaimPath` (defaulting to
 *    {@link DEFAULT_ROLES_CLAIM_PATH}) to get the raw role list.
 * 2. Apply `provider.roleMapping` when present; otherwise keep roles
 *    whose literal value is `"admin"` or `"viewer"`.
 * 3. Prefer `admin` if present; otherwise `viewer` if present;
 *    otherwise fall back to `viewer` (fail-closed on privilege).
 *
 * Exported so unit tests can exercise the mapping in isolation.
 *
 * @param provider - the provider that issued the token.
 * @param claims - the ID-token claims object (`User.profile`).
 * @returns the canonical role assigned to the user.
 */
export function resolveUserRole(
  provider: OAuthProviderConfig,
  claims: unknown,
): Role {
  const claimPath = provider.rolesClaimPath ?? DEFAULT_ROLES_CLAIM_PATH
  const rawRoles = normaliseRawRoles(readClaimPath(claims, claimPath))

  const mapping = provider.roleMapping
  const canonical: Role[] = []
  for (const raw of rawRoles) {
    if (mapping && raw in mapping) {
      canonical.push(mapping[raw])
      continue
    }
    if (raw === ROLE_ADMIN || raw === ROLE_VIEWER) {
      canonical.push(raw)
    }
  }

  if (canonical.includes(ROLE_ADMIN)) {
    return ROLE_ADMIN
  }
  if (canonical.includes(ROLE_VIEWER)) {
    return ROLE_VIEWER
  }
  return ROLE_VIEWER
}

/**
 * Translate an `oidc-client-ts` `User` into the dashboard's
 * {@link AuthenticatedUser} projection.
 *
 * Exported so tests can validate the mapping without going through the
 * whole callback flow.
 *
 * @param provider - the provider that issued `user`.
 * @param user - the OIDC client's `User` object.
 */
export function buildAuthenticatedUser(
  provider: OAuthProviderConfig,
  user: User,
): AuthenticatedUser {
  const profile = user.profile ?? {}
  const name =
    (typeof profile.name === 'string' && profile.name.length > 0
      ? profile.name
      : typeof profile.preferred_username === 'string' &&
        profile.preferred_username.length > 0
      ? profile.preferred_username
      : UNKNOWN_USER_DISPLAY_NAME)
  const email =
    typeof profile.email === 'string' && profile.email.length > 0
      ? profile.email
      : undefined
  const subject =
    typeof profile.sub === 'string' && profile.sub.length > 0
      ? profile.sub
      : ''
  return {
    subject,
    name,
    email,
    role: resolveUserRole(provider, profile),
    providerId: provider.id,
  }
}

/**
 * Format an unknown thrown value into a string suitable for surfacing to
 * the user in the `error` field.
 */
function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.message
  }
  if (typeof err === 'string') {
    return err
  }
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

/**
 * Pinia store that owns the dashboard's authentication state.
 *
 * Kept framework-agnostic: the store imports only from `@/auth/*` and
 * `oidc-client-ts`, so it can be driven equally by the Vue Router
 * guard, Vue components, or direct unit tests.
 */
export const useAuthStore = defineStore('auth', () => {
  /* ── State ─────────────────────────────────────────────────────── */

  /** Loaded provider configuration (`providers: []` means auth disabled). */
  const config = ref<AuthConfig>(loadAuthConfig())

  /** The currently signed-in user, or `null` when not authenticated. */
  const user = ref<AuthenticatedUser | null>(null)

  /** The OIDC access token from the active session, or empty when not authenticated. */
  const accessToken = ref<string>('')

  /**
   * Id of the provider that issued the active session. `null` until a
   * provider has been chosen (via `login()` or restored in `init()`).
   */
  const activeProviderId = ref<string | null>(null)

  /** Lifecycle status — see {@link AuthStatus}. */
  const status = ref<AuthStatus>(INITIAL_STATUS)

  /** Last error message surfaced by an auth action. */
  const error = ref<string | null>(null)

  /* ── Getters ───────────────────────────────────────────────────── */

  /** Whether at least one provider is configured. */
  const authEnabled = computed<boolean>(() => isAuthEnabled(config.value))

  /**
   * Whether a user is currently signed in.
   *
   * When auth is *disabled* (no providers configured) this is always
   * `true` so downstream code can treat "auth-disabled" and
   * "signed-in" uniformly.
   */
  const isAuthenticated = computed<boolean>(() => {
    if (!authEnabled.value) {
      return true
    }
    return user.value !== null
  })

  /**
   * Whether the signed-in user has admin privileges.
   *
   * When auth is disabled, every caller is treated as an admin so the
   * dashboard remains fully usable without a provider.
   */
  const isAdmin = computed<boolean>(() => {
    if (!authEnabled.value) {
      return true
    }
    return user.value?.role === ROLE_ADMIN
  })

  /**
   * Whether the signed-in user has viewer privileges.
   *
   * Admins are also treated as viewers (admin implies viewer). When
   * auth is disabled this is `true`.
   */
  const isViewer = computed<boolean>(() => {
    if (!authEnabled.value) {
      return true
    }
    return (
      user.value?.role === ROLE_VIEWER || user.value?.role === ROLE_ADMIN
    )
  })

  /**
   * Whether the active provider is a Keycloak instance, detected by the
   * presence of `/realms/` in the issuer URL.
   */
  const isKeycloak = computed<boolean>(() => {
    const id = activeProviderId.value
    if (id === null) {
      return false
    }
    const provider = getProviderById(config.value, id)
    return provider !== undefined && provider.issuer.includes(KEYCLOAK_REALM_SEGMENT)
  })

  /**
   * The Keycloak realm name extracted from the active provider's issuer URL,
   * or `null` when the active provider is not Keycloak.
   */
  const keycloakRealm = computed<string | null>(() => {
    const id = activeProviderId.value
    if (id === null) {
      return null
    }
    const provider = getProviderById(config.value, id)
    if (provider === undefined) {
      return null
    }
    return extractKeycloakRealm(provider.issuer)
  })

  /**
   * Whether the signed-in user has the `realm-admin` role for the
   * `realm-management` or `master-realm` Keycloak client. This role
   * grants access to the credential status admin API.
   *
   * Always `false` when the active provider is not Keycloak or when
   * no access token is available.
   */
  const isRealmAdmin = computed<boolean>(() => {
    if (!isKeycloak.value || accessToken.value === '') {
      return false
    }
    const claims = decodeJwtPayload(accessToken.value)
    if (claims === null) {
      return false
    }
    return hasRealmAdminRole(claims)
  })

  /** List of configured providers, exposed for the login picker view. */
  const providers = computed<readonly OAuthProviderConfig[]>(
    () => config.value.providers,
  )

  /* ── Actions ───────────────────────────────────────────────────── */

  /**
   * Attempt to restore an existing session from OIDC client storage.
   *
   * Walks every configured provider and returns the first one with a
   * non-expired cached user. Called by the router guard at app startup.
   */
  async function init(): Promise<void> {
    if (!authEnabled.value) {
      status.value = INITIAL_STATUS
      return
    }

    for (const provider of config.value.providers) {
      let cached: User | null = null
      try {
        cached = await oidcGetUser(provider)
      } catch (err) {
        // A corrupt cache entry for one provider must not prevent
        // checking the others.
        console.warn(
          `[auth] Failed to read cached user for provider "${provider.id}":`,
          err,
        )
        continue
      }
      if (cached && !cached.expired) {
        user.value = buildAuthenticatedUser(provider, cached)
        accessToken.value = cached.access_token ?? ''
        activeProviderId.value = provider.id
        status.value = 'authenticated'
        error.value = null
        return
      }
    }

    user.value = null
    activeProviderId.value = null
    status.value = INITIAL_STATUS
    error.value = null
  }

  /**
   * Redirect the browser to the selected provider's authorisation
   * endpoint. Resolves when the redirect has been initiated; the
   * browser will navigate away before the promise settles in practice.
   *
   * @param providerId - id of a configured provider.
   * @throws Error when no provider with that id is configured.
   */
  async function login(providerId: string): Promise<void> {
    const provider = getProviderById(config.value, providerId)
    if (provider === undefined) {
      const msg = `Unknown OAuth2 provider: ${providerId}`
      error.value = msg
      status.value = 'error'
      throw new Error(msg)
    }
    status.value = 'authenticating'
    error.value = null
    activeProviderId.value = providerId
    try {
      await oidcSigninRedirect(provider)
    } catch (err) {
      status.value = 'error'
      error.value = formatError(err)
      throw err
    }
  }

  /**
   * Handle the OAuth2 redirect callback for a given provider.
   *
   * Exchanges the authorisation code for tokens, maps the ID-token
   * claims onto an {@link AuthenticatedUser}, and updates the store
   * state. The caller (the callback view) is responsible for the
   * subsequent navigation to `returnTo`.
   *
   * @param providerId - id of the provider whose callback is being handled.
   * @param url - optional explicit callback URL. Defaults to
   *   `window.location.href` inside the OIDC client.
   */
  async function handleCallback(
    providerId: string,
    url?: string,
  ): Promise<void> {
    const provider = getProviderById(config.value, providerId)
    if (provider === undefined) {
      const msg = `Unknown OAuth2 provider: ${providerId}`
      status.value = 'error'
      error.value = msg
      throw new Error(msg)
    }

    status.value = 'authenticating'
    error.value = null
    activeProviderId.value = providerId
    try {
      const completed = await oidcSigninRedirectCallback(provider, url)
      user.value = buildAuthenticatedUser(provider, completed)
      accessToken.value = completed.access_token ?? ''
      status.value = 'authenticated'
    } catch (err) {
      user.value = null
      status.value = 'error'
      error.value = formatError(err)
      throw err
    }
  }

  /**
   * Terminate the current session.
   *
   * When a provider is active, triggers the provider's end-session
   * redirect; otherwise clears local state and returns. Callers that
   * need a stable post-logout view should wait for the provider to
   * redirect the browser back to `post_logout_redirect_uri`.
   */
  async function logout(): Promise<void> {
    const providerId = activeProviderId.value
    if (providerId === null) {
      $reset()
      return
    }
    const provider = getProviderById(config.value, providerId)
    if (provider === undefined) {
      $reset()
      return
    }
    try {
      await oidcSignoutRedirect(provider)
    } catch (err) {
      // Ensure the local session is cleared even if the provider
      // end-session endpoint fails — the user explicitly asked for
      // logout.
      try {
        await oidcRemoveUser(provider)
      } catch {
        /* swallow secondary failure */
      }
      status.value = 'error'
      error.value = formatError(err)
      user.value = null
      accessToken.value = ''
      activeProviderId.value = null
      throw err
    }
    user.value = null
    accessToken.value = ''
    activeProviderId.value = null
    status.value = INITIAL_STATUS
    error.value = null
  }

  /** Reset the store to its initial, unauthenticated state. */
  function $reset(): void {
    user.value = null
    accessToken.value = ''
    activeProviderId.value = null
    status.value = INITIAL_STATUS
    error.value = null
  }

  return {
    // State
    config,
    user,
    accessToken,
    activeProviderId,
    status,
    error,
    // Getters
    isAuthEnabled: authEnabled,
    isAuthenticated,
    isAdmin,
    isViewer,
    isKeycloak,
    keycloakRealm,
    isRealmAdmin,
    providers,
    // Actions
    init,
    login,
    handleCallback,
    logout,
    $reset,
  }
})
