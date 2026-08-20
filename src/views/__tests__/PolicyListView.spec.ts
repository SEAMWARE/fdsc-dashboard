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
 * Component tests for PolicyListView.
 *
 * Verifies loading, error, and populated states for the ODRL policies
 * list view, including the global tab and navigation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import PolicyListView from '@/views/policies/PolicyListView.vue'
import en from '@/locales/en.json'

/* ── Mock router ────────────────────────────────────────────────── */
const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ params: {} }),
}))

/* ── Mock policies store ────────────────────────────────────────── */
const mockFetchPolicies = vi.fn()
const mockFetchServices = vi.fn()

vi.mock('@/stores/policies', () => ({
  usePoliciesStore: vi.fn(),
}))

import { usePoliciesStore } from '@/stores/policies'
const mockUsePoliciesStore = vi.mocked(usePoliciesStore)

/* ── Test data ───────────────────────────────────────────────────── */

/** Mock policies for the populated state. */
const MOCK_POLICIES = [
  {
    id: 'policy-1',
    'odrl:uid': 'urn:policy:1',
    odrl: JSON.stringify({ '@type': 'Set', permission: [] }),
    rego: 'package policy',
  },
  {
    id: 'policy-2',
    'odrl:uid': 'urn:policy:2',
    odrl: JSON.stringify({ '@type': 'Offer', permission: [] }),
    rego: '',
  },
  {
    id: 'policy-3',
    'odrl:uid': 'urn:policy:3',
    odrl: 'invalid-json',
    rego: '',
  },
]

/* ── Helpers ─────────────────────────────────────────────────────── */

function createTestI18n() {
  return createI18n({ legacy: false, locale: 'en', messages: { en } })
}

function createTestVuetify() {
  return createVuetify({ components, directives })
}

function createMockStoreState(overrides: Record<string, unknown> = {}) {
  return {
    policies: [],
    totalPolicies: 0,
    pageSize: 10,
    currentPage: 0,
    listLoading: false,
    listError: null,
    selectedPolicy: null,
    detailLoading: false,
    detailError: null,
    saving: false,
    saveError: null,
    services: [],
    servicesLoading: false,
    serviceError: null,
    savingService: false,
    isEmpty: true,
    totalPages: 1,
    fetchPolicies: mockFetchPolicies,
    fetchPolicyDetail: vi.fn(),
    createPolicy: vi.fn(),
    updatePolicy: vi.fn(),
    deletePolicy: vi.fn(),
    fetchServices: mockFetchServices,
    createService: vi.fn(),
    deleteService: vi.fn(),
    fetchServicePolicies: vi.fn().mockResolvedValue([]),
    fetchServicePolicyDetail: vi.fn(),
    createServicePolicy: vi.fn(),
    updateServicePolicy: vi.fn(),
    deleteServicePolicy: vi.fn(),
    $reset: vi.fn(),
    ...overrides,
  }
}

function mountComponent(storeOverrides: Record<string, unknown> = {}): VueWrapper {
  const storeState = createMockStoreState(storeOverrides)
  mockUsePoliciesStore.mockReturnValue(storeState as any)

  return mount(PolicyListView, {
    global: {
      plugins: [createPinia(), createTestI18n(), createTestVuetify()],
      stubs: {
        'router-link': true,
      },
    },
  })
}

/* ── Tests ────────────────────────────────────────────────────────── */

describe('PolicyListView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('rendering states', () => {
    it('should render the page title', () => {
      const wrapper = mountComponent()
      expect(wrapper.text()).toContain('Policies')
    })

    it('should render a create button', () => {
      const wrapper = mountComponent()
      expect(wrapper.text()).toContain('Create Policy')
    })

    it('should render a create template button linking to the template view', () => {
      const wrapper = mountComponent()
      expect(wrapper.text()).toContain('Create Template')
      const templateBtn = wrapper
        .findAllComponents({ name: 'v-btn' })
        .find((btn) => btn.text().includes('Create Template'))
      expect(templateBtn).toBeTruthy()
      expect(templateBtn!.props('to')).toEqual({ name: 'template-manage' })
    })

    it('should render tab headers for Global and By Service', () => {
      const wrapper = mountComponent()
      expect(wrapper.text()).toContain('Global Policies')
      expect(wrapper.text()).toContain('By Service')
    })

    it('should show loading skeleton when listLoading is true', () => {
      const wrapper = mountComponent({ listLoading: true })
      expect(wrapper.findComponent({ name: 'v-skeleton-loader' }).exists()).toBe(true)
    })

    it('should show error alert when listError is set', () => {
      const wrapper = mountComponent({ listError: 'API unavailable' })
      const alert = wrapper.findComponent({ name: 'v-alert' })
      expect(alert.exists()).toBe(true)
      expect(wrapper.text()).toContain('API unavailable')
    })

    it('should show refresh button in error alert', () => {
      const wrapper = mountComponent({ listError: 'Error' })
      expect(wrapper.text()).toContain('Refresh')
    })

    it('should display policy data in the global tab when policies are loaded', () => {
      const wrapper = mountComponent({
        policies: MOCK_POLICIES,
        totalPolicies: 3,
        isEmpty: false,
      })
      expect(wrapper.text()).toContain('policy-1')
      expect(wrapper.text()).toContain('policy-2')
      expect(wrapper.text()).toContain('policy-3')
    })

    it('should display ODRL UID in the table', () => {
      const wrapper = mountComponent({
        policies: MOCK_POLICIES,
        totalPolicies: 3,
        isEmpty: false,
      })
      expect(wrapper.text()).toContain('urn:policy:1')
    })

    it('should extract and display policy type from ODRL JSON', () => {
      const wrapper = mountComponent({
        policies: MOCK_POLICIES,
        totalPolicies: 3,
        isEmpty: false,
      })
      expect(wrapper.text()).toContain('Set')
      expect(wrapper.text()).toContain('Offer')
    })

    it('should display Unknown for invalid ODRL JSON', () => {
      const wrapper = mountComponent({
        policies: MOCK_POLICIES,
        totalPolicies: 3,
        isEmpty: false,
      })
      expect(wrapper.text()).toContain('Unknown')
    })
  })

  describe('lifecycle', () => {
    it('should call fetchPolicies on mount', () => {
      mountComponent()
      expect(mockFetchPolicies).toHaveBeenCalledOnce()
    })
  })

  describe('navigation', () => {
    it('should have Details chips for each policy', () => {
      const wrapper = mountComponent({
        policies: MOCK_POLICIES,
        totalPolicies: 3,
        isEmpty: false,
      })
      expect(wrapper.text()).toContain('Details')
    })
  })
})
