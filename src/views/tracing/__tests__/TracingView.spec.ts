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
 * Unit tests for the {@link TracingView} component.
 *
 * Covers:
 * - Renders the iframe when both Grafana and tracing are configured and
 *   the user is authorised (admin or auth disabled).
 * - Renders the "not configured" informational alert when either the
 *   datasource UID or Grafana URL has not been set.
 * - Renders the "forbidden" defensive warning when auth is enabled and
 *   the user is not an admin.
 * - Back button and Escape keypress both navigate to the home route.
 * - The iframe `src` contains the Grafana Explore path with the correct
 *   datasource UID and kiosk mode.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createI18n } from 'vue-i18n'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import TracingView from '../TracingView.vue'
import { GRAFANA_PROXY_BASE_PATH } from '@/grafana/constants'
import { GRAFANA_EXPLORE_PATH } from '@/tracing/constants'
import enMessages from '@/locales/en.json'

/* ── Mocks ────────────────────────────────────────────────────────── */

/** Stub datasource UID used in test fixtures. */
const TEST_DATASOURCE_UID = 'tempo-abc123'

/** Stub Grafana upstream URL used in test fixtures. */
const TEST_GRAFANA_URL = 'http://grafana:3000'

/**
 * Mock the OIDC facade to prevent the auth store from attempting real
 * network calls when instantiated.
 */
vi.mock('@/auth/oidcClient', () => ({
  signinRedirect: vi.fn(),
  signinRedirectCallback: vi.fn(),
  signoutRedirect: vi.fn(),
  getUser: vi.fn(),
  removeUser: vi.fn(),
}))

/** Controlled return value for {@link loadTracingConfig}. */
const mockLoadTracingConfig = vi.fn()

/** Controlled return value for {@link isTracingConfigured}. */
const mockIsTracingConfigured = vi.fn()

vi.mock('@/tracing/config', () => ({
  loadTracingConfig: (...args: unknown[]) => mockLoadTracingConfig(...args),
  isTracingConfigured: (...args: unknown[]) => mockIsTracingConfigured(...args),
}))

/** Controlled return value for {@link loadGrafanaConfig}. */
const mockLoadGrafanaConfig = vi.fn()

/** Controlled return value for {@link isGrafanaConfigured}. */
const mockIsGrafanaConfigured = vi.fn()

vi.mock('@/grafana/config', () => ({
  loadGrafanaConfig: (...args: unknown[]) => mockLoadGrafanaConfig(...args),
  isGrafanaConfigured: (...args: unknown[]) => mockIsGrafanaConfigured(...args),
}))

/**
 * Controlled mock for the auth store.
 *
 * The component reads `isAuthEnabled` and `isAdmin` from the store.
 */
const mockAuthStore = {
  isAuthEnabled: false,
  isAdmin: true,
  isAuthenticated: true,
  isViewer: true,
  user: null,
  activeProviderId: null,
  config: { providers: [] },
  status: 'idle',
  error: null,
  providers: [],
  init: vi.fn(),
  login: vi.fn(),
  handleCallback: vi.fn(),
  logout: vi.fn(),
  $reset: vi.fn(),
}

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => mockAuthStore,
}))

/* ── Helpers ──────────────────────────────────────────────────────── */

/** Placeholder component for the home route target. */
const HomeStub = { template: '<div>Home</div>' }

/**
 * Create a fresh in-memory router for test use.
 *
 * @returns a Vue Router instance with `home` and `tracing` routes.
 */
function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: HomeStub },
      { path: '/tracing', name: 'tracing', component: TracingView },
    ],
  })
}

/** Create a Vuetify instance for test mounting. */
function createTestVuetify() {
  return createVuetify({ components, directives })
}

/** Create a Vue I18n instance with the real English messages. */
function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: { en: enMessages },
  })
}

/**
 * Mount the {@link TracingView} component with all required plugins.
 *
 * @param testRouter - the router instance to install.
 * @returns the wrapper.
 */
function mountView(testRouter: Router): VueWrapper {
  return mount(TracingView, {
    global: {
      plugins: [createPinia(), createTestVuetify(), createTestI18n(), testRouter],
    },
    attachTo: document.body,
  })
}

/**
 * Set up mocks for a fully configured state (both tracing and Grafana).
 */
function configureDefaults(): void {
  mockLoadTracingConfig.mockReturnValue({ datasourceUid: TEST_DATASOURCE_UID })
  mockIsTracingConfigured.mockReturnValue(true)
  mockLoadGrafanaConfig.mockReturnValue({
    upstreamUrl: TEST_GRAFANA_URL,
    iframeUrl: null,
    panels: [],
  })
  mockIsGrafanaConfigured.mockReturnValue(true)
}

/* ── Tests ────────────────────────────────────────────────────────── */

describe('TracingView', () => {
  let testRouter: Router
  let routerPushSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    setActivePinia(createPinia())
    testRouter = createTestRouter()
    routerPushSpy = vi.spyOn(testRouter, 'push')

    configureDefaults()
    mockAuthStore.isAuthEnabled = false
    mockAuthStore.isAdmin = true
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('rendering states', () => {
    it.each([
      {
        label: 'configured + auth disabled',
        authEnabled: false,
        isAdmin: true,
      },
      {
        label: 'configured + admin user',
        authEnabled: true,
        isAdmin: true,
      },
    ])(
      'renders the iframe when $label',
      async ({ authEnabled, isAdmin }) => {
        mockAuthStore.isAuthEnabled = authEnabled
        mockAuthStore.isAdmin = isAdmin

        const wrapper = mountView(testRouter)
        await testRouter.isReady()

        const iframe = wrapper.find('[data-testid="tracing-iframe"]')
        expect(iframe.exists()).toBe(true)
        expect(wrapper.find('[data-testid="not-configured-alert"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="forbidden-alert"]').exists()).toBe(false)

        wrapper.unmount()
      },
    )

    it('renders the "not configured" alert when datasource UID is unset', async () => {
      mockLoadTracingConfig.mockReturnValue({ datasourceUid: null })
      mockIsTracingConfigured.mockReturnValue(false)

      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      expect(wrapper.find('[data-testid="not-configured-alert"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="tracing-iframe"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="forbidden-alert"]').exists()).toBe(false)

      wrapper.unmount()
    })

    it('renders the "not configured" alert when Grafana URL is unset', async () => {
      mockLoadGrafanaConfig.mockReturnValue({ upstreamUrl: null, iframeUrl: null, panels: [] })
      mockIsGrafanaConfigured.mockReturnValue(false)

      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      expect(wrapper.find('[data-testid="not-configured-alert"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="tracing-iframe"]').exists()).toBe(false)

      wrapper.unmount()
    })

    it('renders the "forbidden" alert when auth is enabled and user is not admin', async () => {
      mockAuthStore.isAuthEnabled = true
      mockAuthStore.isAdmin = false

      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      expect(wrapper.find('[data-testid="forbidden-alert"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="tracing-iframe"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="not-configured-alert"]').exists()).toBe(false)

      wrapper.unmount()
    })
  })

  describe('iframe attributes', () => {
    it('sets src to Grafana Explore path with datasource UID and kiosk mode', async () => {
      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      const iframe = wrapper.find('[data-testid="tracing-iframe"]')
      const src = iframe.attributes('src') ?? ''
      expect(src).toContain(GRAFANA_PROXY_BASE_PATH + GRAFANA_EXPLORE_PATH)
      expect(src).toContain('kiosk')
      expect(src).toContain(encodeURIComponent(TEST_DATASOURCE_UID))

      wrapper.unmount()
    })

    it('includes the required sandbox permissions', async () => {
      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      const iframe = wrapper.find('[data-testid="tracing-iframe"]')
      const sandbox = iframe.attributes('sandbox') ?? ''
      expect(sandbox).toContain('allow-scripts')
      expect(sandbox).toContain('allow-same-origin')
      expect(sandbox).toContain('allow-forms')
      expect(sandbox).toContain('allow-popups')
      expect(sandbox).toContain('allow-popups-to-escape-sandbox')

      wrapper.unmount()
    })

    it('sets referrerpolicy to no-referrer-when-downgrade', async () => {
      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      const iframe = wrapper.find('[data-testid="tracing-iframe"]')
      expect(iframe.attributes('referrerpolicy')).toBe('no-referrer-when-downgrade')

      wrapper.unmount()
    })

    it('sets loading to eager', async () => {
      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      const iframe = wrapper.find('[data-testid="tracing-iframe"]')
      expect(iframe.attributes('loading')).toBe('eager')

      wrapper.unmount()
    })

    it('uses public iframe URL when GRAFANA_IFRAME_URL is configured', async () => {
      const publicUrl = 'https://grafana.example.com'
      mockLoadGrafanaConfig.mockReturnValue({
        upstreamUrl: TEST_GRAFANA_URL,
        iframeUrl: publicUrl,
        panels: [],
      })

      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      const iframe = wrapper.find('[data-testid="tracing-iframe"]')
      const src = iframe.attributes('src') ?? ''
      expect(src).toContain(publicUrl + GRAFANA_EXPLORE_PATH)
      expect(src).not.toContain(GRAFANA_PROXY_BASE_PATH)

      wrapper.unmount()
    })
  })

  describe('navigation', () => {
    it('navigates to home when the back button is clicked', async () => {
      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      const backBtn = wrapper.find('[data-testid="back-btn"]')
      expect(backBtn.exists()).toBe(true)
      await backBtn.trigger('click')

      expect(routerPushSpy).toHaveBeenCalledWith({ name: 'home' })

      wrapper.unmount()
    })

    it('navigates to home when the back button is clicked in "not configured" state', async () => {
      mockLoadTracingConfig.mockReturnValue({ datasourceUid: null })
      mockIsTracingConfigured.mockReturnValue(false)

      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      const backBtn = wrapper.find('[data-testid="back-btn"]')
      expect(backBtn.exists()).toBe(true)
      await backBtn.trigger('click')

      expect(routerPushSpy).toHaveBeenCalledWith({ name: 'home' })

      wrapper.unmount()
    })

    it('navigates to home when Escape is pressed on the wrapper', async () => {
      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      const wrapperEl = wrapper.find('.tracing-view')
      await wrapperEl.trigger('keydown', { key: 'Escape' })

      expect(routerPushSpy).toHaveBeenCalledWith({ name: 'home' })

      wrapper.unmount()
    })

    it('provides an "open in new tab" link pointing to the Explore path', async () => {
      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      const newTabBtn = wrapper.find('[data-testid="open-new-tab-btn"]')
      expect(newTabBtn.exists()).toBe(true)
      expect(newTabBtn.attributes('href')).toBe(GRAFANA_PROXY_BASE_PATH + GRAFANA_EXPLORE_PATH)
      expect(newTabBtn.attributes('target')).toBe('_blank')

      wrapper.unmount()
    })
  })
})
