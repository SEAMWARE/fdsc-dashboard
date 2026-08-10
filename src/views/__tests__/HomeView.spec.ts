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
 * Component tests for HomeView.
 *
 * Regression coverage for a bug where the dashboard's count-only fetch
 * (page size 1, used purely to display totals on the resource cards)
 * permanently overwrote each store's `pageSize`. Because that state is a
 * Pinia singleton shared with the corresponding list view, navigating from
 * Home to e.g. the TIL list afterwards made the list default to a single
 * item per page instead of its normal page size.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import HomeView from '@/views/HomeView.vue'
import en from '@/locales/en.json'

/* ── Mock router ────────────────────────────────────────────────── */
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ params: {} }),
}))

/* ── Mock service/feature-visibility composables ───────────────────
 * These are mocked directly (rather than via the auth store / window
 * globals they read internally) so this test stays focused on the
 * pagination regression and doesn't need to stand up OIDC/auth plumbing.
 */
const mockUseServices = vi.fn()
vi.mock('@/composables/useServices', () => ({ useServices: () => mockUseServices() }))

vi.mock('@/composables/useApisix', () => ({ useApisix: () => ({ isVisible: false }) }))
vi.mock('@/composables/useGrafana', () => ({ useGrafana: () => ({ isVisible: false }) }))
vi.mock('@/composables/useTracing', () => ({ useTracing: () => ({ isVisible: false }) }))
vi.mock('@/composables/useCredentials', () => ({ useCredentials: () => ({ isVisible: false }) }))

/* ── Mock resource stores ───────────────────────────────────────── */
vi.mock('@/stores/til', () => ({ useTilStore: vi.fn() }))
vi.mock('@/stores/tir', () => ({ useTirStore: vi.fn() }))
vi.mock('@/stores/ccs', () => ({ useCcsStore: vi.fn() }))
vi.mock('@/stores/policies', () => ({ usePoliciesStore: vi.fn() }))

import { useTilStore } from '@/stores/til'
import { useTirStore } from '@/stores/tir'
import { useCcsStore } from '@/stores/ccs'
import { usePoliciesStore } from '@/stores/policies'

const mockUseTilStore = vi.mocked(useTilStore)
const mockUseTirStore = vi.mocked(useTirStore)
const mockUseCcsStore = vi.mocked(useCcsStore)
const mockUsePoliciesStore = vi.mocked(usePoliciesStore)

/* ── Helpers ─────────────────────────────────────────────────────── */

function createTestI18n() {
  return createI18n({ legacy: false, locale: 'en', messages: { en } })
}

function createTestVuetify() {
  return createVuetify({ components, directives })
}

/**
 * Build a mock resource store whose fetch action mimics the real stores'
 * side effect of persisting the requested page size — the exact behavior
 * that leaked MINIMAL_PAGE_SIZE into list view state before the fix.
 *
 * @param fetchKey - Name of the store's fetch action (e.g. `fetchIssuers`).
 * @param totalKey - Name of the store's total-count field (e.g. `totalIssuers`).
 * @param initialPageSize - The page size the store "remembers" before Home fetches.
 */
function createMockResourceStore(
  fetchKey: string,
  totalKey: string,
  initialPageSize: number,
) {
  const state: Record<string, unknown> = {
    [totalKey]: 0,
    pageSize: initialPageSize,
    currentPage: 0,
    listLoading: false,
    listError: null,
  }
  state[fetchKey] = vi.fn((page?: number, size?: number) => {
    if (size !== undefined) state.pageSize = size
    if (page !== undefined) state.currentPage = page
    state[totalKey] = 42
    return Promise.resolve()
  })
  return state
}

function mountComponent(): VueWrapper {
  return mount(HomeView, {
    global: {
      plugins: [createPinia(), createTestI18n(), createTestVuetify()],
      stubs: {
        'router-link': true,
      },
    },
  })
}

/* ── Tests ────────────────────────────────────────────────────────── */

describe('HomeView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockUseServices.mockReturnValue({ til: true, tir: true, ccs: true, odrl: true })
  })

  describe('dashboard count fetch — pageSize regression', () => {
    it('restores the TIL store pageSize after the count-only fetch resolves', async () => {
      const tilState = createMockResourceStore('fetchIssuers', 'totalIssuers', 25)
      mockUseTilStore.mockReturnValue(tilState as any)
      mockUseTirStore.mockReturnValue(createMockResourceStore('fetchParticipants', 'totalParticipants', 10) as any)
      mockUseCcsStore.mockReturnValue(createMockResourceStore('fetchServices', 'totalServices', 10) as any)
      mockUsePoliciesStore.mockReturnValue(createMockResourceStore('fetchPolicies', 'totalPolicies', 10) as any)

      mountComponent()
      await flushPromises()

      expect(tilState.fetchIssuers).toHaveBeenCalledWith(0, 1)
      expect(tilState.pageSize).toBe(25)
    })

    it('restores the TIR store pageSize after the count-only fetch resolves', async () => {
      const tirState = createMockResourceStore('fetchParticipants', 'totalParticipants', 30)
      mockUseTilStore.mockReturnValue(createMockResourceStore('fetchIssuers', 'totalIssuers', 10) as any)
      mockUseTirStore.mockReturnValue(tirState as any)
      mockUseCcsStore.mockReturnValue(createMockResourceStore('fetchServices', 'totalServices', 10) as any)
      mockUsePoliciesStore.mockReturnValue(createMockResourceStore('fetchPolicies', 'totalPolicies', 10) as any)

      mountComponent()
      await flushPromises()

      expect(tirState.fetchParticipants).toHaveBeenCalledWith(0, 1)
      expect(tirState.pageSize).toBe(30)
    })

    it('restores the CCS store pageSize after the count-only fetch resolves', async () => {
      const ccsState = createMockResourceStore('fetchServices', 'totalServices', 15)
      mockUseTilStore.mockReturnValue(createMockResourceStore('fetchIssuers', 'totalIssuers', 10) as any)
      mockUseTirStore.mockReturnValue(createMockResourceStore('fetchParticipants', 'totalParticipants', 10) as any)
      mockUseCcsStore.mockReturnValue(ccsState as any)
      mockUsePoliciesStore.mockReturnValue(createMockResourceStore('fetchPolicies', 'totalPolicies', 10) as any)

      mountComponent()
      await flushPromises()

      expect(ccsState.fetchServices).toHaveBeenCalledWith(0, 1)
      expect(ccsState.pageSize).toBe(15)
    })

    it('restores the Policies store pageSize after the count-only fetch resolves', async () => {
      const policiesState = createMockResourceStore('fetchPolicies', 'totalPolicies', 50)
      mockUseTilStore.mockReturnValue(createMockResourceStore('fetchIssuers', 'totalIssuers', 10) as any)
      mockUseTirStore.mockReturnValue(createMockResourceStore('fetchParticipants', 'totalParticipants', 10) as any)
      mockUseCcsStore.mockReturnValue(createMockResourceStore('fetchServices', 'totalServices', 10) as any)
      mockUsePoliciesStore.mockReturnValue(policiesState as any)

      mountComponent()
      await flushPromises()

      expect(policiesState.fetchPolicies).toHaveBeenCalledWith(0, 1)
      expect(policiesState.pageSize).toBe(50)
    })

    it('does not fetch counts for services that are not configured', async () => {
      mockUseServices.mockReturnValue({ til: false, tir: false, ccs: false, odrl: false })
      const tilState = createMockResourceStore('fetchIssuers', 'totalIssuers', 10)
      const tirState = createMockResourceStore('fetchParticipants', 'totalParticipants', 10)
      const ccsState = createMockResourceStore('fetchServices', 'totalServices', 10)
      const policiesState = createMockResourceStore('fetchPolicies', 'totalPolicies', 10)
      mockUseTilStore.mockReturnValue(tilState as any)
      mockUseTirStore.mockReturnValue(tirState as any)
      mockUseCcsStore.mockReturnValue(ccsState as any)
      mockUsePoliciesStore.mockReturnValue(policiesState as any)

      mountComponent()
      await flushPromises()

      expect(tilState.fetchIssuers).not.toHaveBeenCalled()
      expect(tirState.fetchParticipants).not.toHaveBeenCalled()
      expect(ccsState.fetchServices).not.toHaveBeenCalled()
      expect(policiesState.fetchPolicies).not.toHaveBeenCalled()
    })
  })
})
