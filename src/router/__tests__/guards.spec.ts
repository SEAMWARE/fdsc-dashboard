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
 * Unit tests for the router-level authentication guard.
 *
 * Exercises the three branches of {@link authGuard}:
 *
 * - Auth disabled: the guard is a pass-through and performs no redirects
 *   or storage writes, preserving the legacy "no providers" behaviour.
 * - Auth enabled + user authenticated: the guard allows navigation to
 *   every route.
 * - Auth enabled + user unauthenticated: the guard redirects any
 *   non-public route to `/login` while preserving the originally
 *   requested path in `sessionStorage` under
 *   {@link RETURN_TO_STORAGE_KEY}.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { RouteLocationNormalized } from 'vue-router'

import {
  LOGIN_ROUTE_PATH,
  RETURN_TO_STORAGE_KEY,
  RUNTIME_CONFIG_GLOBAL,
} from '@/auth/constants'

/* ── Mock the OIDC facade so the auth store is driveable in isolation ── */

const mockGetUser = vi.fn()
vi.mock('@/auth/oidcClient', () => ({
  signinRedirect: vi.fn(),
  signinRedirectCallback: vi.fn(),
  signoutRedirect: vi.fn(),
  getUser: (...args: unknown[]) => mockGetUser(...args),
  removeUser: vi.fn(),
}))

/* ── Helpers ───────────────────────────────────────────────────────── */

/**
 * Assign (or unassign) the runtime auth-config global so the next
 * `loadAuthConfig()` call reflects the desired provider configuration.
 */
function setRuntimeProviders(providers: unknown[] | null): void {
  if (providers === null) {
    delete (window as unknown as Record<string, unknown>)[RUNTIME_CONFIG_GLOBAL]
  } else {
    (window as unknown as Record<string, unknown>)[RUNTIME_CONFIG_GLOBAL] = {
      providers,
    }
  }
}

/** Build a minimal `RouteLocationNormalized` stub sufficient for the guard. */
function buildRoute(
  overrides: Partial<RouteLocationNormalized> = {},
): RouteLocationNormalized {
  return {
    fullPath: '/til',
    path: '/til',
    name: 'til-list',
    hash: '',
    query: {},
    params: {},
    matched: [],
    meta: {},
    redirectedFrom: undefined,
    ...overrides,
  } as RouteLocationNormalized
}

/** A fully-shaped Keycloak-style provider config usable as a test fixture. */
const KEYCLOAK_PROVIDER = {
  id: 'keycloak',
  displayName: 'Keycloak',
  issuer: 'https://id.example.com/realms/main',
  clientId: 'fdsc-dashboard',
}

/**
 * Re-import both the router module (which owns the guard) and the auth
 * store under a fresh module registry so every test gets a clean
 * `config` ref from `loadAuthConfig()`.
 */
async function freshRouter(): Promise<{
  authGuard: typeof import('@/router').authGuard
  useAuthStore: typeof import('@/stores/auth').useAuthStore
}> {
  vi.resetModules()
  setActivePinia(createPinia())
  const routerMod = await import('@/router')
  const storeMod = await import('@/stores/auth')
  return {
    authGuard: routerMod.authGuard,
    useAuthStore: storeMod.useAuthStore,
  }
}

/* ── Tests ─────────────────────────────────────────────────────────── */

describe('authGuard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    setRuntimeProviders(null)
    window.sessionStorage.clear()
  })

  afterEach(() => {
    setRuntimeProviders(null)
    window.sessionStorage.clear()
  })

  describe('auth disabled (no providers configured)', () => {
    beforeEach(() => {
      setRuntimeProviders([])
    })

    it.each([
      ['home', { name: 'home', path: '/', fullPath: '/' }],
      ['til-list', { name: 'til-list', path: '/til', fullPath: '/til' }],
      [
        'til-create',
        { name: 'til-create', path: '/til/new', fullPath: '/til/new' },
      ],
      [
        'policy-edit',
        {
          name: 'policy-edit',
          path: '/policies/1/edit',
          fullPath: '/policies/1/edit',
        },
      ],
      [
        'apisix-dashboard',
        {
          name: 'apisix-dashboard',
          path: '/apisix',
          fullPath: '/apisix',
        },
      ],
    ])('lets the user navigate to %s unchanged', async (_label, target) => {
      const { authGuard, useAuthStore } = await freshRouter()
      useAuthStore() // instantiate so the store is live
      const next = vi.fn()
      authGuard(buildRoute(target), buildRoute(), next)
      expect(next).toHaveBeenCalledTimes(1)
      expect(next).toHaveBeenCalledWith()
      expect(
        window.sessionStorage.getItem(RETURN_TO_STORAGE_KEY),
      ).toBeNull()
    })
  })

  describe('auth enabled + authenticated user', () => {
    beforeEach(() => {
      setRuntimeProviders([KEYCLOAK_PROVIDER])
    })

    it('allows navigation to any protected route', async () => {
      const { authGuard, useAuthStore } = await freshRouter()
      const store = useAuthStore()
      store.user = {
        subject: 'alice',
        name: 'Alice',
        role: 'admin',
        providerId: 'keycloak',
      }
      store.activeProviderId = 'keycloak'
      const next = vi.fn()
      authGuard(buildRoute({ name: 'til-list' }), buildRoute(), next)
      expect(next).toHaveBeenCalledWith()
    })
  })

  describe('auth enabled + unauthenticated user', () => {
    beforeEach(() => {
      setRuntimeProviders([KEYCLOAK_PROVIDER])
    })

    it.each([
      ['login', LOGIN_ROUTE_PATH, 'login'],
      ['callback', '/callback/keycloak', 'callback'],
    ])(
      'allows access to the public %s route without redirect',
      async (_label, fullPath, name) => {
        const { authGuard, useAuthStore } = await freshRouter()
        useAuthStore()
        const next = vi.fn()
        authGuard(buildRoute({ name, path: fullPath, fullPath }), buildRoute(), next)
        expect(next).toHaveBeenCalledWith()
        expect(
          window.sessionStorage.getItem(RETURN_TO_STORAGE_KEY),
        ).toBeNull()
      },
    )

    it('redirects protected routes to /login and preserves the target', async () => {
      const { authGuard, useAuthStore } = await freshRouter()
      useAuthStore()
      const next = vi.fn()
      authGuard(
        buildRoute({
          name: 'til-detail',
          path: '/til/did:example:1',
          fullPath: '/til/did:example:1?tab=claims',
        }),
        buildRoute(),
        next,
      )
      expect(next).toHaveBeenCalledWith({ name: 'login' })
      expect(window.sessionStorage.getItem(RETURN_TO_STORAGE_KEY)).toBe(
        '/til/did:example:1?tab=claims',
      )
    })

    it('does not overwrite returnTo when the target is /login itself', async () => {
      const { authGuard, useAuthStore } = await freshRouter()
      useAuthStore()
      window.sessionStorage.setItem(RETURN_TO_STORAGE_KEY, '/til')
      const next = vi.fn()
      authGuard(
        buildRoute({ name: 'login', path: LOGIN_ROUTE_PATH, fullPath: LOGIN_ROUTE_PATH }),
        buildRoute(),
        next,
      )
      expect(next).toHaveBeenCalledWith()
      expect(window.sessionStorage.getItem(RETURN_TO_STORAGE_KEY)).toBe('/til')
    })
  })

  describe('auth enabled + requiresAdmin meta', () => {
    beforeEach(() => {
      setRuntimeProviders([KEYCLOAK_PROVIDER])
    })

    it.each([
      ['til-create', 'til-list'],
      ['til-edit', 'til-list'],
      ['ccs-create', 'ccs-list'],
      ['ccs-edit', 'ccs-list'],
      ['policy-create', 'policies-list'],
      ['policy-edit', 'policies-list'],
      ['service-policy-create', 'policies-list'],
      ['service-policy-edit', 'policies-list'],
      ['apisix-dashboard', 'home'],
    ])(
      'redirects a viewer away from %s to %s',
      async (routeName, fallbackName) => {
        const { authGuard, useAuthStore } = await freshRouter()
        const store = useAuthStore()
        store.user = {
          subject: 'bob',
          name: 'Bob',
          role: 'viewer',
          providerId: 'keycloak',
        }
        store.activeProviderId = 'keycloak'
        const next = vi.fn()
        authGuard(
          buildRoute({ name: routeName, meta: { requiresAdmin: true } }),
          buildRoute(),
          next,
        )
        expect(next).toHaveBeenCalledTimes(1)
        expect(next).toHaveBeenCalledWith({ name: fallbackName })
      },
    )

    it.each([
      ['til-create'],
      ['apisix-dashboard'],
    ])('allows admins through %s', async (routeName) => {
      const { authGuard, useAuthStore } = await freshRouter()
      const store = useAuthStore()
      store.user = {
        subject: 'alice',
        name: 'Alice',
        role: 'admin',
        providerId: 'keycloak',
      }
      store.activeProviderId = 'keycloak'
      const next = vi.fn()
      authGuard(
        buildRoute({ name: routeName, meta: { requiresAdmin: true } }),
        buildRoute(),
        next,
      )
      expect(next).toHaveBeenCalledWith()
    })

    it.each([
      ['til-create', '/til/new'],
      ['apisix-dashboard', '/apisix'],
    ])(
      'redirects an unauthenticated user from %s to login first',
      async (routeName, routePath) => {
        // Auth check runs before admin check, so unauthenticated users go
        // through the login flow regardless of `requiresAdmin`.
        const { authGuard, useAuthStore } = await freshRouter()
        useAuthStore()
        const next = vi.fn()
        authGuard(
          buildRoute({
            name: routeName,
            path: routePath,
            fullPath: routePath,
            meta: { requiresAdmin: true },
          }),
          buildRoute(),
          next,
        )
        expect(next).toHaveBeenCalledWith({ name: 'login' })
        expect(window.sessionStorage.getItem(RETURN_TO_STORAGE_KEY)).toBe(
          routePath,
        )
      },
    )

    it('falls back to home when an admin-only route has no recognised family', async () => {
      const { authGuard, useAuthStore } = await freshRouter()
      const store = useAuthStore()
      store.user = {
        subject: 'bob',
        name: 'Bob',
        role: 'viewer',
        providerId: 'keycloak',
      }
      store.activeProviderId = 'keycloak'
      const next = vi.fn()
      authGuard(
        buildRoute({ name: 'custom-admin', meta: { requiresAdmin: true } }),
        buildRoute(),
        next,
      )
      expect(next).toHaveBeenCalledWith({ name: 'home' })
    })
  })

  describe('auth enabled + requiresRealmAdmin meta', () => {
    beforeEach(() => {
      setRuntimeProviders([KEYCLOAK_PROVIDER])
    })

    it('redirects a non-realm-admin away from credentials-list to home', async () => {
      const { authGuard, useAuthStore } = await freshRouter()
      const store = useAuthStore()
      store.user = {
        subject: 'bob',
        name: 'Bob',
        role: 'admin',
        providerId: 'keycloak',
      }
      store.activeProviderId = 'keycloak'
      const next = vi.fn()
      authGuard(
        buildRoute({
          name: 'credentials-list',
          path: '/credentials',
          fullPath: '/credentials',
          meta: { requiresRealmAdmin: true },
        }),
        buildRoute(),
        next,
      )
      expect(next).toHaveBeenCalledTimes(1)
      expect(next).toHaveBeenCalledWith({ name: 'home' })
    })

    it('allows a realm-admin through credentials-list', async () => {
      const { authGuard, useAuthStore } = await freshRouter()
      const store = useAuthStore()
      store.user = {
        subject: 'alice',
        name: 'Alice',
        role: 'admin',
        providerId: 'keycloak',
      }
      store.activeProviderId = 'keycloak'
      vi.spyOn(store, 'isRealmAdmin', 'get').mockReturnValue(true)
      const next = vi.fn()
      authGuard(
        buildRoute({
          name: 'credentials-list',
          path: '/credentials',
          fullPath: '/credentials',
          meta: { requiresRealmAdmin: true },
        }),
        buildRoute(),
        next,
      )
      expect(next).toHaveBeenCalledWith()
    })

    it('redirects an unauthenticated user to login before realm-admin check', async () => {
      const { authGuard, useAuthStore } = await freshRouter()
      useAuthStore()
      const next = vi.fn()
      authGuard(
        buildRoute({
          name: 'credentials-list',
          path: '/credentials',
          fullPath: '/credentials',
          meta: { requiresRealmAdmin: true },
        }),
        buildRoute(),
        next,
      )
      expect(next).toHaveBeenCalledWith({ name: 'login' })
      expect(window.sessionStorage.getItem(RETURN_TO_STORAGE_KEY)).toBe(
        '/credentials',
      )
    })
  })
})
