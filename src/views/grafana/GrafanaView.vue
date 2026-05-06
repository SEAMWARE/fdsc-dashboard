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
<!--
  Copyright 2026 Seamless Middleware Technologies S.L and/or its affiliates
  and other contributors as indicated by the @author tags.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<!--
  Embeds Grafana dashboard panels inside iframes in a responsive grid.

  Renders one of three states:
  1. **Not configured** — an informational alert instructing the operator
     to set the `GRAFANA_URL` environment variable.
  2. **No panels configured** — an informational alert explaining that
     `GRAFANA_PANELS_JSON` is empty.
  3. **Configured with panels** — a compact toolbar (back button + title)
     followed by a responsive `v-row`/`v-col` grid where each panel is
     rendered as an iframe pointing at the BFF Grafana proxy path.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { loadGrafanaConfig, isGrafanaConfigured } from '@/grafana/config'
import { GRAFANA_PROXY_BASE_PATH, GRAFANA_AUTH_TOKEN_PARAM } from '@/grafana/constants'
import { useTheme } from '@/composables/useTheme'
import { useAuth } from '@/composables/useAuth'

/** Trailing-slash-safe base URL builder for iframe src. */
function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

/** Default Vuetify grid column span for panels without an explicit `span`. */
const DEFAULT_PANEL_SPAN = 6

/**
 * Vertical space in rem consumed by the app bar, toolbar, container
 * padding, and panel title above the iframe. Subtracted from `100vh`
 * when no explicit panel height is configured so the iframe fills the
 * remaining viewport.
 */
const VIEWPORT_OFFSET_REM = 12

/**
 * Sandbox permissions granted to each embedded Grafana iframe.
 *
 * - `allow-scripts` and `allow-same-origin` are required because Grafana
 *   is a JS-heavy SPA that relies on cookies and same-origin fetch.
 * - `allow-forms` permits any internal form submissions.
 * - `allow-popups` and `allow-popups-to-escape-sandbox` let it open links
 *   in new tabs if needed.
 */
const IFRAME_SANDBOX = [
  'allow-scripts',
  'allow-same-origin',
  'allow-forms',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
].join(' ')

const router = useRouter()
const { t } = useI18n()
const { currentTheme } = useTheme()
const { token } = useAuth()

const config = loadGrafanaConfig()

/** Whether the upstream Grafana URL has been configured. */
const configured = isGrafanaConfigured(config)

/** Whether panels are configured AND the URL is set. */
const hasPanels = configured && config.panels.length > 0

/** Template ref for the wrapper element that captures keyboard events. */
const wrapperRef = ref<HTMLElement | null>(null)

/**
 * Navigate back to the dashboard home view.
 *
 * Wired to both the toolbar "Back" button and the `Escape` keydown
 * listener on the wrapper element.
 */
function goBack(): void {
  router.push({ name: 'home' })
}

/**
 * Whether iframe URLs are routed through the BFF proxy (as opposed to
 * loading directly from a public Grafana URL).
 */
const usesBffProxy = config.iframeUrl === null

/**
 * Base URL for iframe `src` attributes.
 *
 * When a public iframe URL is configured, panels load directly from the
 * external Grafana instance (avoids sub-path asset resolution issues).
 * Otherwise falls back to the BFF reverse proxy path.
 */
const iframeBase = usesBffProxy ? GRAFANA_PROXY_BASE_PATH : stripTrailingSlash(config.iframeUrl!)

/**
 * Append kiosk mode and theme query parameters to a Grafana panel path.
 *
 * Kiosk mode strips Grafana's own navigation chrome (top bar, sidebar)
 * so only the panel content is visible inside the iframe.
 * The theme parameter is synced with the dashboard's current light/dark
 * setting so the embedded panels match the surrounding UI.
 *
 * @param panelPath - a relative Grafana path, possibly with existing query params.
 * @returns the path with `kiosk` and `theme` parameters guaranteed to be present.
 */
function appendGrafanaParams(panelPath: string): string {
  const separator = panelPath.includes('?') ? '&' : '?'
  return panelPath + separator + 'theme=' + currentTheme.value + '&kiosk'
}

/**
 * Build the full iframe `src` URL for a given panel path.
 *
 * When the BFF proxy is used, the current JWT is appended as a query
 * parameter so the proxy can extract the username and set the
 * `X-WEBAUTH-USER` header. Iframe navigations are plain browser
 * requests that cannot carry custom HTTP headers, so passing the
 * token via query parameter is the only option.
 *
 * @param panelPath - the Grafana panel path (e.g. `/d-solo/uid/slug?panelId=1`).
 * @returns the URL for the iframe, either via the public Grafana URL or the BFF proxy.
 */
function panelSrc(panelPath: string): string {
  let src = iframeBase + appendGrafanaParams(panelPath)
  if (usesBffProxy && token.value) {
    src += '&' + GRAFANA_AUTH_TOKEN_PARAM + '=' + encodeURIComponent(token.value)
  }
  return src
}

onMounted(() => {
  wrapperRef.value?.focus()
})
</script>

<template>
  <div
    ref="wrapperRef"
    class="grafana-view"
    tabindex="-1"
    @keydown.escape="goBack"
  >
    <!-- Not configured: upstream URL not set -->
    <v-container
      v-if="!configured"
      class="mt-4"
    >
      <v-alert
        type="info"
        prominent
        data-testid="not-configured-alert"
      >
        <template #title>
          {{ t('grafana.notConfiguredTitle') }}
        </template>
        {{ t('grafana.notConfigured') }}
      </v-alert>
      <v-btn
        class="mt-4"
        variant="text"
        data-testid="back-btn"
        @click="goBack"
      >
        {{ t('grafana.toolbarBack') }}
      </v-btn>
    </v-container>

    <!-- No panels configured: URL is set but panels array is empty -->
    <v-container
      v-else-if="!hasPanels"
      class="mt-4"
    >
      <v-alert
        type="info"
        prominent
        data-testid="no-panels-alert"
      >
        <template #title>
          {{ t('grafana.noPanelsTitle') }}
        </template>
        {{ t('grafana.noPanels') }}
      </v-alert>
      <v-btn
        class="mt-4"
        variant="text"
        data-testid="back-btn"
        @click="goBack"
      >
        {{ t('grafana.toolbarBack') }}
      </v-btn>
    </v-container>

    <!-- Configured with panels: toolbar + responsive grid of iframes -->
    <template v-else>
      <v-toolbar
        density="compact"
        flat
        color="surface"
      >
        <v-btn
          icon
          data-testid="back-btn"
          @click="goBack"
        >
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <v-toolbar-title>{{ t('grafana.iframeTitle') }}</v-toolbar-title>
      </v-toolbar>

      <v-container fluid>
        <v-row>
          <v-col
            v-for="(panel, index) in config.panels"
            :key="index"
            cols="12"
            :md="panel.span ?? DEFAULT_PANEL_SPAN"
          >
            <h3 class="text-subtitle-1 font-weight-medium mb-2">
              {{ panel.title }}
            </h3>
            <iframe
              :src="panelSrc(panel.path)"
              :title="panel.title"
              :sandbox="IFRAME_SANDBOX"
              referrerpolicy="no-referrer-when-downgrade"
              loading="eager"
              :style="{
                height:
                  panel.height != null
                    ? `${panel.height}px`
                    : `calc(100vh - ${VIEWPORT_OFFSET_REM}rem)`,
                width: '100%',
                border: '0',
              }"
              :data-testid="`grafana-iframe-${index}`"
            />
          </v-col>
        </v-row>
      </v-container>
    </template>
  </div>
</template>

<style scoped>
.grafana-view {
  outline: none;
}
</style>
