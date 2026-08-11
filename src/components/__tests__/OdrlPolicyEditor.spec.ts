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
 * Unit tests for the {@link OdrlPolicyEditor} Vue wrapper component.
 *
 * Verifies that:
 * - Props are bound as HTML attributes on the underlying custom element.
 * - Dashboard state (auth token, theme, locale) is sourced from the
 *   correct composables and passed reactively to the custom element.
 * - Native Custom Events dispatched by the custom element are re-emitted
 *   as standard Vue events with the `detail` payload unwrapped.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { ref, computed } from 'vue'
import en from '@/locales/en.json'

/* ── Mock composables ──────────────────────────────────────────────── */

/** Controllable reactive token value for the mocked auth composable. */
const mockToken = ref('test-jwt-token')

/** Controllable flag for edit permission. */
const mockCanEdit = ref(true)

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    token: mockToken,
    isAuthenticated: computed(() => !!mockToken.value),
    isAdmin: computed(() => true),
    isViewer: computed(() => true),
    canEdit: mockCanEdit,
    canDelete: computed(() => true),
    isAuthEnabled: computed(() => true),
    isRealmAdmin: computed(() => false),
    isKeycloak: computed(() => false),
    keycloakRealm: computed(() => null),
    setToken: vi.fn(),
    clearToken: vi.fn(),
    initAuth: vi.fn(),
    getAuthTokenSync: () => mockToken.value,
  }),
}))

/** Controllable reactive theme name. */
const mockCurrentTheme = ref<'light' | 'dark'>('light')

vi.mock('@/composables/useTheme', () => ({
  useTheme: () => ({
    isDark: computed(() => mockCurrentTheme.value === 'dark'),
    currentTheme: mockCurrentTheme,
    toggleTheme: vi.fn(),
    setTheme: vi.fn(),
    initTheme: vi.fn(),
  }),
}))

/** Controllable reactive locale code. */
const mockCurrentLocale = ref('en')

vi.mock('@/composables/useLocale', () => ({
  useLocale: () => ({
    currentLocale: mockCurrentLocale,
    availableLocales: [{ code: 'en', label: 'English' }],
    setLocale: vi.fn(),
    initLocale: vi.fn(),
  }),
}))

/* Stub the side-effect import that registers the custom element. */
vi.mock('@seamware/odrl-policy-editor', () => ({}))

/* ── Import component under test (after mocks) ────────────────────── */

import OdrlPolicyEditor from '@/components/OdrlPolicyEditor.vue'

/* ── Helpers ─────────────────────────────────────────────────────── */

/** Create a fresh i18n instance wired up with the real `en` bundle. */
function createTestI18n() {
  return createI18n({ legacy: false, locale: 'en', messages: { en } })
}

/** Create a fresh Vuetify instance. */
function createTestVuetify() {
  return createVuetify({ components, directives })
}

/**
 * Mount the OdrlPolicyEditor wrapper with all required global plugins.
 *
 * @param propsOverrides - Props to pass to the component.
 * @returns The mounted wrapper.
 */
function mountComponent(propsOverrides: Record<string, unknown> = {}): VueWrapper {
  return mount(OdrlPolicyEditor, {
    props: { ...propsOverrides },
    global: {
      plugins: [createPinia(), createTestI18n(), createTestVuetify()],
    },
  })
}

/**
 * Find the `<odrl-policy-editor>` custom element stub inside the wrapper.
 *
 * Vue treats custom elements as plain HTML elements in test mode, so we
 * query the DOM directly by tag name.
 */
function findEditor(wrapper: VueWrapper): Element {
  const el = wrapper.element.querySelector('odrl-policy-editor') ?? wrapper.element
  return el
}

/* ── Tests ────────────────────────────────────────────────────────── */

describe('OdrlPolicyEditor', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // Reset controllable refs to defaults
    mockToken.value = 'test-jwt-token'
    mockCurrentTheme.value = 'light'
    mockCurrentLocale.value = 'en'
  })

  describe('prop binding', () => {
    it('should bind the default api-base-url attribute', () => {
      const wrapper = mountComponent()
      const el = findEditor(wrapper)
      expect(el.getAttribute('api-base-url')).toBe('/api/odrl')
    })

    it('should bind a custom api-base-url when provided', () => {
      const wrapper = mountComponent({ apiBaseUrl: '/custom/api' })
      const el = findEditor(wrapper)
      expect(el.getAttribute('api-base-url')).toBe('/custom/api')
    })

    it('should bind mode="create" by default', () => {
      const wrapper = mountComponent()
      const el = findEditor(wrapper)
      expect(el.getAttribute('mode')).toBe('create')
    })

    it('should bind mode="edit" when specified', () => {
      const wrapper = mountComponent({ mode: 'edit' })
      const el = findEditor(wrapper)
      expect(el.getAttribute('mode')).toBe('edit')
    })

    it('should bind policy-id when provided', () => {
      const wrapper = mountComponent({
        mode: 'edit',
        policyId: 'urn:policy:42',
      })
      const el = findEditor(wrapper)
      expect(el.getAttribute('policy-id')).toBe('urn:policy:42')
    })
  })

  describe('dashboard state binding', () => {
    it('should bind the auth token from useAuth composable', () => {
      mockToken.value = 'my-bearer-token'
      const wrapper = mountComponent()
      const el = findEditor(wrapper)
      expect(el.getAttribute('auth-token')).toBe('my-bearer-token')
    })

    it('should omit auth-token attribute when token is empty', () => {
      mockToken.value = ''
      const wrapper = mountComponent()
      const el = findEditor(wrapper)
      // When token is empty, computed returns null, so attribute is not set
      const attr = el.getAttribute('auth-token')
      expect(attr === null || attr === '').toBe(true)
    })

    it('should bind the theme from useTheme composable', () => {
      mockCurrentTheme.value = 'dark'
      const wrapper = mountComponent()
      const el = findEditor(wrapper)
      expect(el.getAttribute('theme')).toBe('dark')
    })

    it('should bind the locale from useLocale composable', () => {
      mockCurrentLocale.value = 'en'
      const wrapper = mountComponent()
      const el = findEditor(wrapper)
      expect(el.getAttribute('locale')).toBe('en')
    })
  })

  describe('event re-emission', () => {
    it('should re-emit policy-created with unwrapped detail', async () => {
      const wrapper = mountComponent()
      const el = findEditor(wrapper)

      const detail = { policy: { '@type': 'Set' }, id: 'policy-new' }
      const event = new CustomEvent('policy-created', { detail, bubbles: true })
      el.dispatchEvent(event)

      const emitted = wrapper.emitted('policy-created')
      expect(emitted).toBeTruthy()
      expect(emitted![0]).toEqual([detail])
    })

    it('should re-emit policy-updated with unwrapped detail', async () => {
      const wrapper = mountComponent()
      const el = findEditor(wrapper)

      const detail = { policy: { '@type': 'Offer' }, id: 'policy-42' }
      const event = new CustomEvent('policy-updated', { detail, bubbles: true })
      el.dispatchEvent(event)

      const emitted = wrapper.emitted('policy-updated')
      expect(emitted).toBeTruthy()
      expect(emitted![0]).toEqual([detail])
    })

    it('should re-emit editor-cancelled with unwrapped detail', async () => {
      const wrapper = mountComponent()
      const el = findEditor(wrapper)

      const detail = {}
      const event = new CustomEvent('editor-cancelled', {
        detail,
        bubbles: true,
      })
      el.dispatchEvent(event)

      const emitted = wrapper.emitted('editor-cancelled')
      expect(emitted).toBeTruthy()
      expect(emitted![0]).toEqual([detail])
    })

    it('should re-emit template-created with unwrapped detail', async () => {
      const wrapper = mountComponent()
      const el = findEditor(wrapper)

      const detail = { template: { name: 'DOME Access' }, id: 'template-1' }
      const event = new CustomEvent('template-created', { detail, bubbles: true })
      el.dispatchEvent(event)

      const emitted = wrapper.emitted('template-created')
      expect(emitted).toBeTruthy()
      expect(emitted![0]).toEqual([detail])
    })

    it('should re-emit template-updated with unwrapped detail', async () => {
      const wrapper = mountComponent()
      const el = findEditor(wrapper)

      const detail = { template: { name: 'DOME Access v2' }, id: 'template-1' }
      const event = new CustomEvent('template-updated', { detail, bubbles: true })
      el.dispatchEvent(event)

      const emitted = wrapper.emitted('template-updated')
      expect(emitted).toBeTruthy()
      expect(emitted![0]).toEqual([detail])
    })
  })

  describe('lifecycle cleanup', () => {
    it('should not throw when unmounted', () => {
      const wrapper = mountComponent()
      expect(() => wrapper.unmount()).not.toThrow()
    })
  })
})
