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
  Embeds the Grafana Explore view inside an iframe for trace querying.

  Renders one of three states:
  1. **Configured** — a compact toolbar (back button + title + "open in
     new tab") followed by a full-height iframe pointing at the Grafana
     Explore page with the Tempo datasource pre-selected and kiosk mode
     enabled.
  2. **Not configured** — an informational alert instructing the operator
     to set the required environment variables.
  3. **Forbidden** — a defensive warning shown when an authenticated
     non-admin user somehow bypasses the router guard.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { loadTracingConfig, isTracingConfigured } from '@/tracing/config'
import { loadGrafanaConfig, isGrafanaConfigured } from '@/grafana/config'
import { GRAFANA_EXPLORE_PATH, DEFAULT_ORG_ID } from '@/tracing/constants'
import { GRAFANA_PROXY_BASE_PATH, GRAFANA_AUTH_TOKEN_PARAM } from '@/grafana/constants'
import { useTheme } from '@/composables/useTheme'
import { useAuth } from '@/composables/useAuth'
import { useAuthStore } from '@/stores/auth'

/** Height in pixels of the Vuetify default-density app bar. */
const APP_BAR_HEIGHT_PX = 64

/** Height in pixels of the compact-density toolbar above the iframe. */
const TOOLBAR_HEIGHT_PX = 48

/** Trailing-slash-safe base URL builder for iframe src. */
function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

/**
 * Sandbox permissions granted to the embedded iframe.
 *
 * - `allow-scripts` and `allow-same-origin` are required because Grafana
 *   is a JS-heavy SPA that relies on cookies and same-origin fetch.
 * - `allow-forms` permits its internal form submissions (query editor).
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
const auth = useAuthStore()

const tracingConfig = loadTracingConfig()
const grafanaConfig = loadGrafanaConfig()

/** Whether the Tempo datasource UID has been configured. */
const tracingConfigured = isTracingConfigured(tracingConfig)

/** Whether the Grafana upstream URL has been configured. */
const grafanaConfigured = isGrafanaConfigured(grafanaConfig)

/** Whether both tracing and Grafana are fully configured. */
const configured = tracingConfigured && grafanaConfigured

/**
 * Whether the current user lacks admin privileges.
 *
 * This is a defensive check — the router guard should block non-admin
 * users before they reach this view. If auth is disabled, everyone is
 * treated as admin (legacy behaviour).
 */
const forbidden = computed(() => auth.isAuthEnabled && !auth.isAdmin)

/** CSS height expression for the iframe to fill the remaining viewport. */
const iframeHeight = `calc(100vh - ${APP_BAR_HEIGHT_PX + TOOLBAR_HEIGHT_PX}px)`

/**
 * Whether iframe URLs are routed through the BFF proxy (as opposed to
 * loading directly from a public Grafana URL).
 */
const usesBffProxy = grafanaConfig.iframeUrl === null

/**
 * Base URL for iframe `src` attributes.
 *
 * When a public iframe URL is configured, the Explore view loads directly
 * from the external Grafana instance. Otherwise falls back to the BFF
 * reverse proxy path.
 */
const iframeBase = usesBffProxy
  ? GRAFANA_PROXY_BASE_PATH
  : stripTrailingSlash(grafanaConfig.iframeUrl!)

/**
 * Build the Grafana Explore query parameters that pre-select the Tempo
 * datasource and set a default time range.
 *
 * The `left` parameter is the legacy Explore state format supported by
 * Grafana 9+ and still accepted by Grafana 10+/11+.
 *
 * @returns URL query string (without leading `?` or `&`).
 */
function buildExploreQueryParams(): string {
  const left = JSON.stringify({
    datasource: tracingConfig.datasourceUid,
    queries: [{ refId: 'A' }],
    range: { from: 'now-1h', to: 'now' },
  })
  return (
    'orgId=' +
    DEFAULT_ORG_ID +
    '&left=' +
    encodeURIComponent(left) +
    '&theme=' +
    currentTheme.value +
    '&kiosk'
  )
}

/**
 * Full iframe `src` URL pointing at Grafana Explore with the Tempo
 * datasource pre-selected and kiosk mode enabled.
 *
 * When the BFF proxy is used, the current JWT is appended as a query
 * parameter so the proxy can extract the username and set the
 * `X-WEBAUTH-USER` header.
 */
const iframeSrc = computed(() => {
  let src = iframeBase + GRAFANA_EXPLORE_PATH + '?' + buildExploreQueryParams()
  if (usesBffProxy && token.value) {
    src += '&' + GRAFANA_AUTH_TOKEN_PARAM + '=' + encodeURIComponent(token.value)
  }
  return src
})

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

onMounted(() => {
  wrapperRef.value?.focus()
})
</script>

<template>
  <div
    ref="wrapperRef"
    class="tracing-view"
    tabindex="-1"
    @keydown.escape="goBack"
  >
    <!-- Forbidden: non-admin user bypassed the guard (defensive) -->
    <v-container
      v-if="forbidden"
      class="mt-4"
    >
      <v-alert
        type="warning"
        prominent
        data-testid="forbidden-alert"
      >
        {{ t('tracing.adminOnly') }}
      </v-alert>
      <v-btn
        class="mt-4"
        variant="text"
        data-testid="back-btn"
        @click="goBack"
      >
        {{ t('tracing.toolbarBack') }}
      </v-btn>
    </v-container>

    <!-- Not configured: datasource UID or Grafana URL not set -->
    <v-container
      v-else-if="!configured"
      class="mt-4"
    >
      <v-alert
        type="info"
        prominent
        data-testid="not-configured-alert"
      >
        <template #title>
          {{ t('tracing.notConfiguredTitle') }}
        </template>
        {{ t('tracing.notConfigured') }}
      </v-alert>
      <v-btn
        class="mt-4"
        variant="text"
        data-testid="back-btn"
        @click="goBack"
      >
        {{ t('tracing.toolbarBack') }}
      </v-btn>
    </v-container>

    <!-- Configured: toolbar + Explore iframe -->
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
        <v-toolbar-title>{{ t('tracing.iframeTitle') }}</v-toolbar-title>
        <v-spacer />
        <v-btn
          icon
          :href="iframeBase + GRAFANA_EXPLORE_PATH"
          target="_blank"
          rel="noopener noreferrer"
          :title="t('tracing.openInNewTab')"
          data-testid="open-new-tab-btn"
        >
          <v-icon>mdi-open-in-new</v-icon>
        </v-btn>
      </v-toolbar>

      <iframe
        :src="iframeSrc"
        :title="t('tracing.iframeTitle')"
        :sandbox="IFRAME_SANDBOX"
        referrerpolicy="no-referrer-when-downgrade"
        loading="eager"
        :style="{ height: iframeHeight, width: '100%', border: '0' }"
        data-testid="tracing-iframe"
      />
    </template>
  </div>
</template>

<style scoped>
.tracing-view {
  outline: none;
}
</style>
