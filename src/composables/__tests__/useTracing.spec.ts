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
 * Unit tests for the `useTracing` composable.
 *
 * Verifies the visibility truth table:
 *
 * | tracingConfigured | grafanaConfigured | authEnabled | role    | isVisible |
 * |-------------------|-------------------|-------------|---------|-----------|
 * | false             | false             | false       | (any)   | false     |
 * | true              | false             | false       | (any)   | false     |
 * | false             | true              | false       | (any)   | false     |
 * | true              | true              | false       | (any)   | true      |
 * | true              | true              | true        | admin   | true      |
 * | true              | true              | true        | viewer  | false     |
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import {
  RUNTIME_TRACING_CONFIG_GLOBAL,
  RUNTIME_TRACING_CONFIG_DATASOURCE_UID_KEY,
} from '@/tracing/constants'
import {
  RUNTIME_GRAFANA_CONFIG_GLOBAL,
  RUNTIME_GRAFANA_CONFIG_URL_KEY,
} from '@/grafana/constants'
import { RUNTIME_CONFIG_GLOBAL } from '@/auth/constants'

/** Tempo datasource UID used by tests that need a "configured" state. */
const STUB_DATASOURCE_UID = 'tempo-abc123'

/** Grafana upstream URL used by tests that need Grafana configured. */
const STUB_GRAFANA_URL = 'http://grafana:3000'

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
 * Set (or clear) the runtime tracing config global on `window`.
 *
 * @param uid - the datasource UID to inject, or `null` to remove.
 */
function setRuntimeTracingConfig(uid: string | null): void {
  if (uid === null) {
    delete (window as unknown as Record<string, unknown>)[RUNTIME_TRACING_CONFIG_GLOBAL]
  } else {
    (window as unknown as Record<string, unknown>)[RUNTIME_TRACING_CONFIG_GLOBAL] = {
      [RUNTIME_TRACING_CONFIG_DATASOURCE_UID_KEY]: uid,
    }
  }
}

/**
 * Set (or clear) the runtime Grafana config global on `window`.
 *
 * @param url - the upstream URL to inject, or `null` to remove.
 */
function setRuntimeGrafanaConfig(url: string | null): void {
  if (url === null) {
    delete (window as unknown as Record<string, unknown>)[RUNTIME_GRAFANA_CONFIG_GLOBAL]
  } else {
    (window as unknown as Record<string, unknown>)[RUNTIME_GRAFANA_CONFIG_GLOBAL] = {
      [RUNTIME_GRAFANA_CONFIG_URL_KEY]: url,
      iframeUrl: null,
      panels: [],
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
  const composableMod = await import('@/composables/useTracing')
  const authStoreMod = await import('@/stores/auth')
  return {
    useTracing: composableMod.useTracing,
    useAuthStore: authStoreMod.useAuthStore,
  }
}

describe('useTracing', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllEnvs()
    setRuntimeTracingConfig(null)
    setRuntimeGrafanaConfig(null)
    setRuntimeAuthProviders(null)
  })

  afterEach(() => {
    localStorage.clear()
    vi.unstubAllEnvs()
    setRuntimeTracingConfig(null)
    setRuntimeGrafanaConfig(null)
    setRuntimeAuthProviders(null)
  })

  describe('isConfigured', () => {
    it('returns false when neither datasource UID nor Grafana URL is set', async () => {
      const { useTracing } = await freshComposable()
      const { isConfigured } = useTracing()
      expect(isConfigured).toBe(false)
    })

    it('returns false when only datasource UID is set but Grafana URL is not', async () => {
      setRuntimeTracingConfig(STUB_DATASOURCE_UID)
      const { useTracing } = await freshComposable()
      const { isConfigured } = useTracing()
      expect(isConfigured).toBe(false)
    })

    it('returns false when only Grafana URL is set but datasource UID is not', async () => {
      setRuntimeGrafanaConfig(STUB_GRAFANA_URL)
      const { useTracing } = await freshComposable()
      const { isConfigured } = useTracing()
      expect(isConfigured).toBe(false)
    })

    it('returns true when both datasource UID and Grafana URL are configured', async () => {
      setRuntimeTracingConfig(STUB_DATASOURCE_UID)
      setRuntimeGrafanaConfig(STUB_GRAFANA_URL)
      const { useTracing } = await freshComposable()
      const { isConfigured } = useTracing()
      expect(isConfigured).toBe(true)
    })
  })

  describe('tracingConfig', () => {
    it('contains null datasourceUid when unconfigured', async () => {
      const { useTracing } = await freshComposable()
      const { tracingConfig } = useTracing()
      expect(tracingConfig.datasourceUid).toBeNull()
    })

    it('contains the datasource UID when configured', async () => {
      setRuntimeTracingConfig(STUB_DATASOURCE_UID)
      const { useTracing } = await freshComposable()
      const { tracingConfig } = useTracing()
      expect(tracingConfig.datasourceUid).toBe(STUB_DATASOURCE_UID)
    })
  })

  describe('isVisible — parameterized truth table', () => {
    /**
     * Each row describes a combination of:
     * - `tracingConfigured`: whether a Tempo datasource UID is set.
     * - `grafanaConfigured`: whether a Grafana upstream URL is set.
     * - `authEnabled`: whether an OIDC provider is configured.
     * - `role`: the user's role in the auth store ('admin' | 'viewer' | null).
     * - `expected`: the expected value of `isVisible`.
     */
    const cases: Array<{
      tracingConfigured: boolean
      grafanaConfigured: boolean
      authEnabled: boolean
      role: 'admin' | 'viewer' | null
      expected: boolean
    }> = [
      // Neither configured — always hidden
      { tracingConfigured: false, grafanaConfigured: false, authEnabled: false, role: null, expected: false },
      // Only tracing configured — hidden (no Grafana)
      { tracingConfigured: true, grafanaConfigured: false, authEnabled: false, role: null, expected: false },
      // Only Grafana configured — hidden (no datasource UID)
      { tracingConfigured: false, grafanaConfigured: true, authEnabled: false, role: null, expected: false },
      // Both configured + auth disabled — visible (open mode)
      { tracingConfigured: true, grafanaConfigured: true, authEnabled: false, role: null, expected: true },
      // Both configured + auth enabled + admin — visible
      { tracingConfigured: true, grafanaConfigured: true, authEnabled: true, role: 'admin', expected: true },
      // Both configured + auth enabled + viewer — hidden
      { tracingConfigured: true, grafanaConfigured: true, authEnabled: true, role: 'viewer', expected: false },
    ]

    it.each(cases)(
      'tracing=$tracingConfigured, grafana=$grafanaConfigured, authEnabled=$authEnabled, role=$role → isVisible=$expected',
      async ({ tracingConfigured, grafanaConfigured, authEnabled, role, expected }) => {
        if (tracingConfigured) {
          setRuntimeTracingConfig(STUB_DATASOURCE_UID)
        }
        if (grafanaConfigured) {
          setRuntimeGrafanaConfig(STUB_GRAFANA_URL)
        }
        if (authEnabled) {
          setRuntimeAuthProviders([KEYCLOAK_PROVIDER_RAW])
        }

        const { useTracing, useAuthStore } = await freshComposable()
        const authStore = useAuthStore()

        if (authEnabled && role !== null) {
          authStore.$patch({
            user: {
              subject: 'sub-123',
              name: 'Test User',
              role,
              providerId: 'keycloak',
            },
            activeProviderId: 'keycloak',
          })
        }

        const { isVisible } = useTracing()
        expect(isVisible.value).toBe(expected)
      },
    )
  })
})
