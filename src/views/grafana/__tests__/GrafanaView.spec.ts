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
 * Unit tests for the {@link GrafanaView} component.
 *
 * Covers:
 * - Renders the "not configured" informational alert when the upstream
 *   URL has not been set.
 * - Renders the "no panels" informational alert when the upstream URL
 *   is set but the panels array is empty.
 * - Renders the correct number of iframes when panels are configured.
 * - Each iframe `src` is correctly constructed from
 *   `GRAFANA_PROXY_BASE_PATH + panel.path`.
 * - Back button and Escape keypress both navigate to the home route.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createI18n } from 'vue-i18n'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import GrafanaView from '../GrafanaView.vue'
import { GRAFANA_PROXY_BASE_PATH } from '@/grafana/constants'
import enMessages from '@/locales/en.json'

/* -- Mocks ---------------------------------------------------------- */

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

/** Controlled return value for {@link loadGrafanaConfig}. */
const mockLoadGrafanaConfig = vi.fn()

/** Controlled return value for {@link isGrafanaConfigured}. */
const mockIsGrafanaConfigured = vi.fn()

vi.mock('@/grafana/config', () => ({
  loadGrafanaConfig: (...args: unknown[]) => mockLoadGrafanaConfig(...args),
  isGrafanaConfigured: (...args: unknown[]) => mockIsGrafanaConfigured(...args),
}))

/* -- Helpers --------------------------------------------------------- */

/** A valid upstream URL used in test fixtures. */
const TEST_UPSTREAM_URL = 'http://grafana:3000'

/**
 * Compute the expected iframe src for a panel, matching the component's
 * URL normalization (appends kiosk mode and theme parameters).
 *
 * @param base - base URL (BFF proxy path or public iframe URL).
 * @param panelPath - the panel's Grafana path including existing query params.
 * @param theme - the expected theme name (defaults to 'light', the Vuetify default).
 * @returns the fully resolved iframe src URL.
 */
function expectedSrc(base: string, panelPath: string, theme = 'light'): string {
  const url = new URL(panelPath, 'http://localhost')
  url.searchParams.delete('kiosk')
  url.searchParams.set('theme', theme)
  const normalized = url.pathname + url.search
  const separator = normalized.includes('?') ? '&' : '?'
  return base + normalized + separator + 'kiosk'
}

/** Default panel height in pixels. */
const DEFAULT_PANEL_HEIGHT_PX = 400

/** Default Vuetify grid column span. */
const DEFAULT_PANEL_SPAN = 6

/** Sample panels with various configurations. */
const SAMPLE_PANELS = [
  {
    title: 'CPU Usage',
    path: '/d-solo/abc/cpu?panelId=1&kiosk',
    span: 12,
    height: 600,
  },
  {
    title: 'Memory',
    path: '/d-solo/abc/mem?panelId=2&kiosk',
  },
  {
    title: 'Disk I/O',
    path: '/d-solo/def/disk?panelId=3&kiosk',
    span: 4,
    height: 300,
  },
]

/** Placeholder component for the home route target. */
const HomeStub = { template: '<div>Home</div>' }

/**
 * Create a fresh in-memory router for test use.
 *
 * @returns a Vue Router instance with `home` and `grafana-dashboards` routes.
 */
function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: HomeStub },
      { path: '/grafana', name: 'grafana-dashboards', component: GrafanaView },
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
 * Mount the {@link GrafanaView} component with all required plugins.
 *
 * @param testRouter - the router instance to install.
 * @returns the wrapper.
 */
function mountView(testRouter: Router): VueWrapper {
  return mount(GrafanaView, {
    global: {
      plugins: [createPinia(), createTestVuetify(), createTestI18n(), testRouter],
    },
    attachTo: document.body,
  })
}

/* -- Tests ----------------------------------------------------------- */

describe('GrafanaView', () => {
  let testRouter: Router
  let routerPushSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    setActivePinia(createPinia())
    testRouter = createTestRouter()
    routerPushSpy = vi.spyOn(testRouter, 'push')

    // Default: configured with panels, no public iframe URL (uses BFF proxy)
    mockLoadGrafanaConfig.mockReturnValue({
      upstreamUrl: TEST_UPSTREAM_URL,
      iframeUrl: null,
      panels: SAMPLE_PANELS,
    })
    mockIsGrafanaConfigured.mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('rendering states', () => {
    it('renders the "not configured" alert when upstream URL is null', async () => {
      mockLoadGrafanaConfig.mockReturnValue({ upstreamUrl: null, iframeUrl: null, panels: [] })
      mockIsGrafanaConfigured.mockReturnValue(false)

      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      expect(wrapper.find('[data-testid="not-configured-alert"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="no-panels-alert"]').exists()).toBe(false)
      expect(wrapper.findAll('iframe')).toHaveLength(0)

      wrapper.unmount()
    })

    it('renders the "no panels" alert when URL is set but panels array is empty', async () => {
      mockLoadGrafanaConfig.mockReturnValue({
        upstreamUrl: TEST_UPSTREAM_URL,
        iframeUrl: null,
        panels: [],
      })
      mockIsGrafanaConfigured.mockReturnValue(true)

      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      expect(wrapper.find('[data-testid="no-panels-alert"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="not-configured-alert"]').exists()).toBe(false)
      expect(wrapper.findAll('iframe')).toHaveLength(0)

      wrapper.unmount()
    })

    it('renders the correct number of iframes when panels are configured', async () => {
      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      const iframes = wrapper.findAll('iframe')
      expect(iframes).toHaveLength(SAMPLE_PANELS.length)

      expect(wrapper.find('[data-testid="not-configured-alert"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="no-panels-alert"]').exists()).toBe(false)

      wrapper.unmount()
    })

    it.each(
      SAMPLE_PANELS.map((panel, index) => ({
        index,
        title: panel.title,
        path: panel.path,
      })),
    )(
      'renders iframe $index with correct src via BFF proxy for panel "$title"',
      async ({ index, path }) => {
        const wrapper = mountView(testRouter)
        await testRouter.isReady()

        const iframe = wrapper.find(`[data-testid="grafana-iframe-${index}"]`)
        expect(iframe.exists()).toBe(true)
        expect(iframe.attributes('src')).toBe(expectedSrc(GRAFANA_PROXY_BASE_PATH, path))

        wrapper.unmount()
      },
    )

    it('uses the public iframe URL when iframeUrl is configured', async () => {
      const publicUrl = 'https://grafana.example.com'
      mockLoadGrafanaConfig.mockReturnValue({
        upstreamUrl: TEST_UPSTREAM_URL,
        iframeUrl: publicUrl,
        panels: SAMPLE_PANELS,
      })

      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      const iframe = wrapper.find('[data-testid="grafana-iframe-0"]')
      expect(iframe.attributes('src')).toBe(expectedSrc(publicUrl, SAMPLE_PANELS[0].path))

      wrapper.unmount()
    })

    it('strips trailing slash from iframeUrl before building src', async () => {
      const publicUrl = 'https://grafana.example.com/'
      mockLoadGrafanaConfig.mockReturnValue({
        upstreamUrl: TEST_UPSTREAM_URL,
        iframeUrl: publicUrl,
        panels: SAMPLE_PANELS,
      })

      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      const iframe = wrapper.find('[data-testid="grafana-iframe-0"]')
      expect(iframe.attributes('src')).toBe(
        expectedSrc('https://grafana.example.com', SAMPLE_PANELS[0].path),
      )

      wrapper.unmount()
    })
  })

  describe('iframe attributes', () => {
    it('includes the required sandbox permissions on each iframe', async () => {
      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      const iframe = wrapper.find('[data-testid="grafana-iframe-0"]')
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

      const iframe = wrapper.find('[data-testid="grafana-iframe-0"]')
      expect(iframe.attributes('referrerpolicy')).toBe('no-referrer-when-downgrade')

      wrapper.unmount()
    })

    it('sets loading to eager', async () => {
      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      const iframe = wrapper.find('[data-testid="grafana-iframe-0"]')
      expect(iframe.attributes('loading')).toBe('eager')

      wrapper.unmount()
    })

    it('uses the panel title as the iframe title attribute', async () => {
      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      const iframe = wrapper.find('[data-testid="grafana-iframe-0"]')
      expect(iframe.attributes('title')).toBe(SAMPLE_PANELS[0].title)

      wrapper.unmount()
    })
  })

  describe('panel dimensions', () => {
    it('applies custom span and height when specified', async () => {
      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      // First panel has span=12, height=600
      const iframe0 = wrapper.find('[data-testid="grafana-iframe-0"]')
      expect(iframe0.attributes('style')).toContain('height: 600px')

      wrapper.unmount()
    })

    it('applies default height when panel has no explicit height', async () => {
      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      // Second panel has no height specified -- should use default 400px
      const iframe1 = wrapper.find('[data-testid="grafana-iframe-1"]')
      expect(iframe1.attributes('style')).toContain(`height: ${DEFAULT_PANEL_HEIGHT_PX}px`)

      wrapper.unmount()
    })

    it.each([
      {
        label: 'explicit span',
        panelIndex: 0,
        expectedSpan: SAMPLE_PANELS[0].span,
      },
      {
        label: 'default span',
        panelIndex: 1,
        expectedSpan: DEFAULT_PANEL_SPAN,
      },
      {
        label: 'custom span',
        panelIndex: 2,
        expectedSpan: SAMPLE_PANELS[2].span,
      },
    ])(
      'uses $label for panel at index $panelIndex',
      async ({ panelIndex, expectedSpan }) => {
        const wrapper = mountView(testRouter)
        await testRouter.isReady()

        // Vuetify v-col with :md="span" renders a class like v-col-md-{span}.
        // The wrapper HTML contains the class on the column element wrapping
        // each iframe, so we search the full HTML for the expected pattern
        // near the corresponding data-testid attribute.
        const html = wrapper.html()
        const spanClass = `v-col-md-${expectedSpan}`
        // Find the iframe testid and verify the column class exists in the output
        expect(html).toContain(`data-testid="grafana-iframe-${panelIndex}"`)
        expect(html).toContain(spanClass)

        wrapper.unmount()
      },
    )
  })

  describe('kiosk and theme parameters', () => {
    it('appends kiosk parameter when panel path does not already include it', async () => {
      mockLoadGrafanaConfig.mockReturnValue({
        upstreamUrl: TEST_UPSTREAM_URL,
        iframeUrl: null,
        panels: [{ title: 'No Kiosk', path: '/d-solo/abc/cpu?panelId=1' }],
      })

      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      const src = wrapper.find('[data-testid="grafana-iframe-0"]').attributes('src') ?? ''
      expect(src).toContain('kiosk')
      expect(src).toContain('theme=light')

      wrapper.unmount()
    })

    it('does not duplicate kiosk when panel path already includes it', async () => {
      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      const src = wrapper.find('[data-testid="grafana-iframe-0"]').attributes('src') ?? ''
      const kioskCount = (src.match(/kiosk/g) ?? []).length
      expect(kioskCount).toBe(1)

      wrapper.unmount()
    })

    it('appends theme=light when Vuetify uses the default light theme', async () => {
      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      const src = wrapper.find('[data-testid="grafana-iframe-0"]').attributes('src') ?? ''
      expect(src).toContain('theme=light')

      wrapper.unmount()
    })

    it('appends theme=dark when Vuetify uses the dark theme', async () => {
      const darkVuetify = createVuetify({
        components,
        directives,
        theme: { defaultTheme: 'dark' },
      })

      const wrapper = mount(GrafanaView, {
        global: {
          plugins: [createPinia(), darkVuetify, createTestI18n(), testRouter],
        },
        attachTo: document.body,
      })
      await testRouter.isReady()

      const src = wrapper.find('[data-testid="grafana-iframe-0"]').attributes('src') ?? ''
      expect(src).toContain('theme=dark')

      wrapper.unmount()
    })
  })

  describe('panel titles', () => {
    it('renders a title heading for each panel', async () => {
      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      const headings = wrapper.findAll('h3')
      const headingTexts = headings.map((h) => h.text())
      for (const panel of SAMPLE_PANELS) {
        expect(headingTexts).toContain(panel.title)
      }

      wrapper.unmount()
    })
  })

  describe('navigation', () => {
    it('navigates to home when the back button is clicked (configured state)', async () => {
      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      const backBtn = wrapper.find('[data-testid="back-btn"]')
      expect(backBtn.exists()).toBe(true)
      await backBtn.trigger('click')

      expect(routerPushSpy).toHaveBeenCalledWith({ name: 'home' })

      wrapper.unmount()
    })

    it('navigates to home when the back button is clicked in "not configured" state', async () => {
      mockLoadGrafanaConfig.mockReturnValue({ upstreamUrl: null, iframeUrl: null, panels: [] })
      mockIsGrafanaConfigured.mockReturnValue(false)

      const wrapper = mountView(testRouter)
      await testRouter.isReady()

      const backBtn = wrapper.find('[data-testid="back-btn"]')
      expect(backBtn.exists()).toBe(true)
      await backBtn.trigger('click')

      expect(routerPushSpy).toHaveBeenCalledWith({ name: 'home' })

      wrapper.unmount()
    })

    it('navigates to home when the back button is clicked in "no panels" state', async () => {
      mockLoadGrafanaConfig.mockReturnValue({
        upstreamUrl: TEST_UPSTREAM_URL,
        iframeUrl: null,
        panels: [],
      })
      mockIsGrafanaConfigured.mockReturnValue(true)

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

      const wrapperEl = wrapper.find('.grafana-view')
      await wrapperEl.trigger('keydown', { key: 'Escape' })

      expect(routerPushSpy).toHaveBeenCalledWith({ name: 'home' })

      wrapper.unmount()
    })
  })
})
