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
 * Component tests for {@link TemplateFormView}.
 *
 * Verifies that the view:
 * - Renders the {@link OdrlPolicyEditor} wrapper focused on the
 *   template-management tab with the other tabs hidden.
 * - Shows a success snackbar (without navigating) on `template-created`
 *   and `template-updated`.
 * - Redirects non-admin users to the policy list on mount.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, VueWrapper, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { computed, ref } from 'vue'
import TemplateFormView from '@/views/policies/TemplateFormView.vue'
import en from '@/locales/en.json'

/* ── Mock router ────────────────────────────────────────────────── */

const mockPush = vi.fn()
const mockReplace = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useRoute: () => ({ params: {} }),
}))

/* ── Mock useAuth composable ────────────────────────────────────── */

/** Controllable flag: set to `false` to simulate a viewer (non-admin). */
const mockCanEdit = ref(true)

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    token: ref('mock-token'),
    isAuthenticated: computed(() => true),
    isAdmin: computed(() => mockCanEdit.value),
    isViewer: computed(() => true),
    canEdit: mockCanEdit,
    canDelete: computed(() => mockCanEdit.value),
    isAuthEnabled: computed(() => true),
    isRealmAdmin: computed(() => false),
    isKeycloak: computed(() => false),
    keycloakRealm: computed(() => null),
    setToken: vi.fn(),
    clearToken: vi.fn(),
    initAuth: vi.fn(),
    getAuthTokenSync: () => 'mock-token',
  }),
}))

/* Stub the composables used internally by the OdrlPolicyEditor wrapper. */
vi.mock('@/composables/useTheme', () => ({
  useTheme: () => ({
    isDark: computed(() => false),
    currentTheme: ref('light'),
    toggleTheme: vi.fn(),
    setTheme: vi.fn(),
    initTheme: vi.fn(),
  }),
}))

vi.mock('@/composables/useLocale', () => ({
  useLocale: () => ({
    currentLocale: ref('en'),
    availableLocales: [{ code: 'en', label: 'English' }],
    setLocale: vi.fn(),
    initLocale: vi.fn(),
  }),
}))

/* Stub the side-effect import that registers the custom element. */
vi.mock('@seamware/odrl-policy-editor', () => ({}))

/* Mock the OdrlPolicyEditor wrapper so we don't render the real custom
 * element (which would recurse without the Vite `isCustomElement` option). */
vi.mock('@/components/OdrlPolicyEditor.vue', () => ({
  default: {
    name: 'OdrlPolicyEditor',
    props: {
      hideBuilderTab: { type: Boolean, default: false },
      hideRawTab: { type: Boolean, default: false },
      hideTemplateTab: { type: Boolean, default: false },
      hideTemplateCreateTab: { type: Boolean, default: false },
      initialTab: { type: [String, null], default: null },
    },
    emits: ['template-created', 'template-updated'],
    template: '<div class="odrl-policy-editor-stub" />',
  },
}))

/* ── Helpers ─────────────────────────────────────────────────────── */

function createTestI18n() {
  return createI18n({ legacy: false, locale: 'en', messages: { en } })
}

function createTestVuetify() {
  return createVuetify({ components, directives })
}

function mountComponent(): VueWrapper {
  return mount(TemplateFormView, {
    global: {
      plugins: [createPinia(), createTestI18n(), createTestVuetify()],
      stubs: { 'router-link': true },
    },
  })
}

function findEditorComponent(wrapper: VueWrapper) {
  return wrapper.findComponent({ name: 'OdrlPolicyEditor' })
}

/* ── Tests ────────────────────────────────────────────────────────── */

describe('TemplateFormView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockCanEdit.value = true
  })

  describe('rendering', () => {
    it('should render the templates page title', () => {
      const wrapper = mountComponent()
      expect(wrapper.text()).toContain('Policy Templates')
    })

    it('should render the back button', () => {
      const wrapper = mountComponent()
      expect(wrapper.text()).toContain('Back')
    })

    it('should open the editor on the template-management tab', () => {
      const wrapper = mountComponent()
      const editor = findEditorComponent(wrapper)
      expect(editor.exists()).toBe(true)
      expect(editor.props('initialTab')).toBe('manage-templates')
    })

    it('should hide the builder, raw and template-selection tabs', () => {
      const wrapper = mountComponent()
      const editor = findEditorComponent(wrapper)
      expect(editor.props('hideBuilderTab')).toBe(true)
      expect(editor.props('hideRawTab')).toBe(true)
      expect(editor.props('hideTemplateTab')).toBe(true)
      // The template-management tab itself must remain visible.
      expect(editor.props('hideTemplateCreateTab')).toBe(false)
    })
  })

  describe('event handling', () => {
    it('should show a success message without navigating on template-created', async () => {
      const wrapper = mountComponent()
      const editor = findEditorComponent(wrapper)

      await editor.vm.$emit('template-created', {
        template: { name: 'DOME Access' },
        id: 'template-1',
      })
      await flushPromises()

      expect((wrapper.vm as any).successMessage).toBe('Template created successfully')
      expect((wrapper.vm as any).showSuccess).toBe(true)
      expect(mockPush).not.toHaveBeenCalled()
    })

    it('should show a success message without navigating on template-updated', async () => {
      const wrapper = mountComponent()
      const editor = findEditorComponent(wrapper)

      await editor.vm.$emit('template-updated', {
        template: { name: 'DOME Access v2' },
        id: 'template-1',
      })
      await flushPromises()

      expect((wrapper.vm as any).successMessage).toBe('Template updated successfully')
      expect((wrapper.vm as any).showSuccess).toBe(true)
      expect(mockPush).not.toHaveBeenCalled()
    })
  })

  describe('admin guard', () => {
    it('should redirect non-admin users to the policy list', async () => {
      mockCanEdit.value = false
      mountComponent()
      await flushPromises()

      expect(mockReplace).toHaveBeenCalledWith({ name: 'policies-list' })
    })

    it('should not redirect admin users', async () => {
      mockCanEdit.value = true
      mountComponent()
      await flushPromises()

      expect(mockReplace).not.toHaveBeenCalled()
    })
  })
})
