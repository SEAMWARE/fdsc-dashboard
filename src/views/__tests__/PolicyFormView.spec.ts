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
 * Component tests for {@link PolicyFormView}.
 *
 * Verifies that the refactored view:
 * - Renders the {@link OdrlPolicyEditor} wrapper component with the
 *   correct props for both create and edit modes.
 * - Navigates to the policy detail view on `policy-created` and
 *   `policy-updated` events.
 * - Navigates back to the policy list on `editor-cancelled`.
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
import PolicyFormView from '@/views/policies/PolicyFormView.vue'
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
 * element (which would cause infinite recursion in the test environment
 * without the Vite `isCustomElement` compiler option at mount-time). */
vi.mock('@/components/OdrlPolicyEditor.vue', () => ({
  default: {
    name: 'OdrlPolicyEditor',
    props: {
      apiBaseUrl: { type: String, default: '/api/odrl' },
      mode: { type: String, default: 'create' },
      policyId: { type: [String, null], default: null },
    },
    emits: [
      'policy-created',
      'policy-updated',
      'editor-cancelled',
      'template-created',
      'template-updated',
    ],
    template: '<div class="odrl-policy-editor-stub" />',
  },
}))

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
 * Mount PolicyFormView with all required global plugins.
 *
 * @param propsOverrides - Props to pass (e.g. `{ id: 'policy-42' }`).
 * @returns The mounted wrapper.
 */
function mountComponent(propsOverrides: Record<string, unknown> = {}): VueWrapper {
  return mount(PolicyFormView, {
    props: { ...propsOverrides },
    global: {
      plugins: [createPinia(), createTestI18n(), createTestVuetify()],
      stubs: {
        'router-link': true,
      },
    },
  })
}

/**
 * Find the OdrlPolicyEditor wrapper component inside the view.
 * Returns the VueWrapper for the child component, or undefined if absent.
 */
function findEditorComponent(wrapper: VueWrapper) {
  return wrapper.findComponent({ name: 'OdrlPolicyEditor' })
}

/* ── Tests ────────────────────────────────────────────────────────── */

describe('PolicyFormView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockCanEdit.value = true
  })

  describe('create mode', () => {
    it('should render the create page title', () => {
      const wrapper = mountComponent()
      expect(wrapper.text()).toContain('Create Policy')
    })

    it('should render the back button', () => {
      const wrapper = mountComponent()
      expect(wrapper.text()).toContain('Back')
    })

    it('should render the OdrlPolicyEditor component', () => {
      const wrapper = mountComponent()
      const editor = findEditorComponent(wrapper)
      expect(editor.exists()).toBe(true)
    })

    it('should pass mode="create" to the editor when no id is provided', () => {
      const wrapper = mountComponent()
      const editor = findEditorComponent(wrapper)
      expect(editor.props('mode')).toBe('create')
    })

    it('should pass api-base-url="/api/odrl" to the editor wrapper', () => {
      const wrapper = mountComponent()
      const editor = findEditorComponent(wrapper)
      expect(editor.exists()).toBe(true)
      expect(editor.props('apiBaseUrl')).toBe('/api/odrl')
    })

    it('should pass null policyId in create mode', () => {
      const wrapper = mountComponent()
      const editor = findEditorComponent(wrapper)
      expect(editor.props('policyId')).toBeNull()
    })
  })

  describe('edit mode', () => {
    it('should render the edit page title', () => {
      const wrapper = mountComponent({ id: 'policy-42' })
      expect(wrapper.text()).toContain('Edit Policy')
    })

    it('should pass mode="edit" to the editor when an id is provided', () => {
      const wrapper = mountComponent({ id: 'policy-42' })
      const editor = findEditorComponent(wrapper)
      expect(editor.props('mode')).toBe('edit')
    })

    it('should pass the correct policy-id to the editor', () => {
      const wrapper = mountComponent({ id: 'urn:policy:abc' })
      const editor = findEditorComponent(wrapper)
      expect(editor.props('policyId')).toBe('urn:policy:abc')
    })
  })

  describe('event handling', () => {
    it('should navigate to policy detail on policy-created', async () => {
      const wrapper = mountComponent()
      const editor = findEditorComponent(wrapper)

      await editor.vm.$emit('policy-created', {
        policy: { '@type': 'Set' },
        id: 'new-policy-1',
      })
      await flushPromises()

      expect(mockPush).toHaveBeenCalledWith({
        name: 'policy-detail',
        params: { id: 'new-policy-1' },
      })
    })

    it('should navigate to policy list when policy-created has no id', async () => {
      const wrapper = mountComponent()
      const editor = findEditorComponent(wrapper)

      await editor.vm.$emit('policy-created', { policy: {} })
      await flushPromises()

      expect(mockPush).toHaveBeenCalledWith({ name: 'policies-list' })
    })

    it('should navigate to policy detail on policy-updated', async () => {
      const wrapper = mountComponent({ id: 'policy-42' })
      const editor = findEditorComponent(wrapper)

      await editor.vm.$emit('policy-updated', {
        policy: { '@type': 'Set' },
        id: 'policy-42',
      })
      await flushPromises()

      expect(mockPush).toHaveBeenCalledWith({
        name: 'policy-detail',
        params: { id: 'policy-42' },
      })
    })

    it('should use route id as fallback for policy-updated without id', async () => {
      const wrapper = mountComponent({ id: 'route-id-fallback' })
      const editor = findEditorComponent(wrapper)

      await editor.vm.$emit('policy-updated', { policy: {} })
      await flushPromises()

      expect(mockPush).toHaveBeenCalledWith({
        name: 'policy-detail',
        params: { id: 'route-id-fallback' },
      })
    })

    it('should navigate to policy list on editor-cancelled', async () => {
      const wrapper = mountComponent()
      const editor = findEditorComponent(wrapper)

      await editor.vm.$emit('editor-cancelled', {})
      await flushPromises()

      expect(mockPush).toHaveBeenCalledWith({ name: 'policies-list' })
    })

    it('should set success message after policy-created', async () => {
      const wrapper = mountComponent()
      const editor = findEditorComponent(wrapper)

      await editor.vm.$emit('policy-created', {
        policy: {},
        id: 'new-policy',
      })
      await flushPromises()

      // Vuetify snackbars teleport outside the wrapper, so we verify the
      // internal reactive state instead of searching the DOM text.
      expect((wrapper.vm as any).successMessage).toBe('Policy created successfully')
      expect((wrapper.vm as any).showSuccess).toBe(true)
    })

    it('should set success message after policy-updated', async () => {
      const wrapper = mountComponent({ id: 'policy-42' })
      const editor = findEditorComponent(wrapper)

      await editor.vm.$emit('policy-updated', {
        policy: {},
        id: 'policy-42',
      })
      await flushPromises()

      expect((wrapper.vm as any).successMessage).toBe('Policy updated successfully')
      expect((wrapper.vm as any).showSuccess).toBe(true)
    })

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
      // Template management stays within the editor — no route change.
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
