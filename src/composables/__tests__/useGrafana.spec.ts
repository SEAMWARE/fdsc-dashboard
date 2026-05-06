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
 * Unit tests for the `useGrafana` composable.
 *
 * Verifies the visibility truth table:
 *
 * | configured | authEnabled | authenticated | isVisible |
 * |------------|-------------|---------------|-----------|
 * | false      | false       | (any)         | false     |
 * | false      | true        | true          | false     |
 * | false      | true        | false         | false     |
 * | true       | false       | (any)         | true      |
 * | true       | true        | true          | true      |
 * | true       | true        | false         | false     |
 *
 * Unlike Apisix (which requires admin role), Grafana panels are visible
 * to **all authenticated users** — no admin check is performed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { RUNTIME_GRAFANA_CONFIG_GLOBAL } from '@/grafana/constants'
import { RUNTIME_CONFIG_GLOBAL } from '@/auth/constants'

/** Upstream URL used by tests that need a "configured" state. */
const STUB_UPSTREAM_URL = 'http://grafana:3000'

/** Sample panels for configured tests. */
const STUB_PANELS = [
  { title: 'CPU', path: '/d-solo/abc/cpu?panelId=1&kiosk' },
  { title: 'Memory', path: '/d-solo/abc/mem?panelId=2&kiosk' },
]

/** A syntactically complete OIDC provider. */
const KEYCLOAK_PROVIDER_RAW = {
  id: 'keycloak',
  displayName: 'Keycloak',
  issuer: 'https://id.example.com/realms/main',
  clientId: 'fdsc-dashboard',
}

vi.mock('@/auth/oidcClient', () => ({
  signinRedirect: vi.fn(),
  signinRedirectCallback: vi.fn(),
  signoutRedirect: vi.fn(),
  getUser: vi.fn(),
  removeUser: vi.fn(),
}))

/**
 * Set (or clear) the runtime Grafana config global on `window`.
 *
 * @param url - the upstream URL to inject, or `null` to remove.
 * @param panels - optional panels array (defaults to empty).
 */
function setRuntimeGrafanaConfig(url: string | null, panels: unknown[] = []): void {
  if (url === null) {
    delete (window as unknown as Record<string, unknown>)[RUNTIME_GRAFANA_CONFIG_GLOBAL]
  } else {
    (window as unknown as Record<string, unknown>)[RUNTIME_GRAFANA_CONFIG_GLOBAL] = {
      upstreamUrl: url,
      panels,
    }
  }
}

/**
 * Set (or clear) the runtime auth-config global on `window`.
 *
 * @param providers - the provider list to inject, or `null` to remove.
 */
function setRuntimeAuthProviders(providers: unknown[] | null): void {
  if (providers === null) {
    delete (window as unknown as Record<string, unknown>)[RUNTIME_CONFIG_GLOBAL]
  } else {
    (window as unknown as Record<string, unknown>)[RUNTIME_CONFIG_GLOBAL] = {
      providers,
    }
  }
}

/**
 * Import a fresh copy of the composable + auth store under a clean module
 * registry so each test starts from scratch.
 */
async function freshComposable() {
  vi.resetModules()
  setActivePinia(createPinia())
  const composableMod = await import('@/composables/useGrafana')
  const authStoreMod = await import('@/stores/auth')
  return {
    useGrafana: composableMod.useGrafana,
    useAuthStore: authStoreMod.useAuthStore,
  }
}

describe('useGrafana', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllEnvs()
    setRuntimeGrafanaConfig(null)
    setRuntimeAuthProviders(null)
  })

  afterEach(() => {
    localStorage.clear()
    vi.unstubAllEnvs()
    setRuntimeGrafanaConfig(null)
    setRuntimeAuthProviders(null)
  })

  describe('isConfigured', () => {
    it('returns false when no upstream URL is set', async () => {
      const { useGrafana } = await freshComposable()
      const { isConfigured } = useGrafana()
      expect(isConfigured).toBe(false)
    })

    it('returns true when the runtime global provides an upstream URL', async () => {
      setRuntimeGrafanaConfig(STUB_UPSTREAM_URL, STUB_PANELS)
      const { useGrafana } = await freshComposable()
      const { isConfigured } = useGrafana()
      expect(isConfigured).toBe(true)
    })
  })

  describe('config', () => {
    it('contains null upstreamUrl when unconfigured', async () => {
      const { useGrafana } = await freshComposable()
      const { config } = useGrafana()
      expect(config.upstreamUrl).toBeNull()
      expect(config.panels).toEqual([])
    })

    it('contains the upstream URL and panels when configured', async () => {
      setRuntimeGrafanaConfig(STUB_UPSTREAM_URL, STUB_PANELS)
      const { useGrafana } = await freshComposable()
      const { config } = useGrafana()
      expect(config.upstreamUrl).toBe(STUB_UPSTREAM_URL)
      expect(config.panels).toHaveLength(STUB_PANELS.length)
    })
  })

  describe('isVisible -- parameterized truth table', () => {
    /**
     * Each row describes a combination of:
     * - `configured`: whether a Grafana upstream URL is set.
     * - `authEnabled`: whether an OIDC provider is configured.
     * - `authenticated`: whether the user is authenticated (has a user record in store).
     * - `expected`: the expected value of `isVisible`.
     *
     * Unlike Apisix, Grafana does NOT require the admin role — any
     * authenticated user (viewer or admin) can see the panels.
     */
    const cases: Array<{
      configured: boolean
      authEnabled: boolean
      authenticated: boolean
      expected: boolean
    }> = [
      // Not configured -- always hidden
      { configured: false, authEnabled: false, authenticated: false, expected: false },
      { configured: false, authEnabled: true, authenticated: true, expected: false },
      { configured: false, authEnabled: true, authenticated: false, expected: false },
      // Configured + auth disabled -- visible (open mode)
      { configured: true, authEnabled: false, authenticated: false, expected: true },
      // Configured + auth enabled + authenticated (viewer) -- visible
      { configured: true, authEnabled: true, authenticated: true, expected: true },
      // Configured + auth enabled + not authenticated -- hidden
      { configured: true, authEnabled: true, authenticated: false, expected: false },
    ]

    it.each(cases)(
      'configured=$configured, authEnabled=$authEnabled, authenticated=$authenticated -> isVisible=$expected',
      async ({ configured, authEnabled, authenticated, expected }) => {
        // Configure Grafana upstream
        if (configured) {
          setRuntimeGrafanaConfig(STUB_UPSTREAM_URL, STUB_PANELS)
        }

        // Configure auth providers
        if (authEnabled) {
          setRuntimeAuthProviders([KEYCLOAK_PROVIDER_RAW])
        }

        const { useGrafana, useAuthStore } = await freshComposable()
        const authStore = useAuthStore()

        // Simulate authentication state
        if (authEnabled && authenticated) {
          // Directly set store state to simulate an authenticated user.
          // Use 'viewer' role to prove admin is NOT required for Grafana.
          authStore.$patch({
            user: {
              subject: 'sub-123',
              name: 'Test Viewer',
              role: 'viewer',
              providerId: 'keycloak',
            },
            activeProviderId: 'keycloak',
          })
        }

        const { isVisible } = useGrafana()
        expect(isVisible.value).toBe(expected)
      },
    )
  })

  describe('visibility difference from Apisix -- no admin requirement', () => {
    it('is visible to viewer role when configured and authenticated', async () => {
      setRuntimeGrafanaConfig(STUB_UPSTREAM_URL, STUB_PANELS)
      setRuntimeAuthProviders([KEYCLOAK_PROVIDER_RAW])

      const { useGrafana, useAuthStore } = await freshComposable()
      const authStore = useAuthStore()

      authStore.$patch({
        user: {
          subject: 'sub-viewer',
          name: 'Viewer User',
          role: 'viewer',
          providerId: 'keycloak',
        },
        activeProviderId: 'keycloak',
      })

      const { isVisible } = useGrafana()
      expect(isVisible.value).toBe(true)
    })

    it('is visible to admin role when configured and authenticated', async () => {
      setRuntimeGrafanaConfig(STUB_UPSTREAM_URL, STUB_PANELS)
      setRuntimeAuthProviders([KEYCLOAK_PROVIDER_RAW])

      const { useGrafana, useAuthStore } = await freshComposable()
      const authStore = useAuthStore()

      authStore.$patch({
        user: {
          subject: 'sub-admin',
          name: 'Admin User',
          role: 'admin',
          providerId: 'keycloak',
        },
        activeProviderId: 'keycloak',
      })

      const { isVisible } = useGrafana()
      expect(isVisible.value).toBe(true)
    })
  })
})
