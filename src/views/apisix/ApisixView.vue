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
  Embeds the Apache APISIX Dashboard inside an iframe.

  Renders one of three states:
  1. **Configured** — a compact toolbar (back button + "open in new tab")
     followed by a full-height iframe pointing at the same-origin
     reverse-proxy path `/apisix-dashboard/`.
  2. **Not configured** — an informational alert instructing the operator
     to set the upstream URL env vars.
  3. **Forbidden** — a defensive warning shown when an authenticated
     non-admin user somehow bypasses the router guard.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { loadApisixConfig, isApisixConfigured } from '@/apisix/config'
import { APISIX_DASHBOARD_BASE_PATH, APISIX_AUTH_TOKEN_PARAM } from '@/apisix/constants'
import { useAuthStore } from '@/stores/auth'
import { useAuth } from '@/composables/useAuth'

/** Height in pixels of the Vuetify default-density app bar. */
const APP_BAR_HEIGHT_PX = 64

/** Height in pixels of the compact-density toolbar above the iframe. */
const TOOLBAR_HEIGHT_PX = 48

/**
 * Sandbox permissions granted to the embedded iframe.
 *
 * - `allow-scripts` and `allow-same-origin` are required because the Apisix
 *   Dashboard is a JS-heavy SPA that relies on cookies and same-origin fetch.
 * - `allow-forms` permits its internal form submissions.
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
const auth = useAuthStore()
const { token } = useAuth()

const config = loadApisixConfig()

/** Whether the upstream Apisix Dashboard URL has been configured. */
const configured = isApisixConfigured(config)

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
 * Full iframe `src` URL including the auth token query parameter.
 *
 * Iframe navigations are plain browser requests that cannot carry custom
 * HTTP headers, so the JWT is passed as a query parameter. The BFF auth
 * guard reads it, sets a session cookie for subsequent AJAX requests
 * from the embedded SPA, and the proxy strips the parameter before
 * forwarding to the upstream APISIX Dashboard.
 */
const iframeSrc = computed(() => {
  let src = APISIX_DASHBOARD_BASE_PATH
  if (token.value) {
    src += '?' + APISIX_AUTH_TOKEN_PARAM + '=' + encodeURIComponent(token.value)
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
    class="apisix-view"
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
        {{ t('apisix.adminOnly') }}
      </v-alert>
      <v-btn
        class="mt-4"
        variant="text"
        data-testid="back-btn"
        @click="goBack"
      >
        {{ t('apisix.toolbarBack') }}
      </v-btn>
    </v-container>

    <!-- Not configured: upstream URL not set -->
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
          {{ t('apisix.notConfiguredTitle') }}
        </template>
        {{ t('apisix.notConfigured') }}
      </v-alert>
      <v-btn
        class="mt-4"
        variant="text"
        data-testid="back-btn"
        @click="goBack"
      >
        {{ t('apisix.toolbarBack') }}
      </v-btn>
    </v-container>

    <!-- Configured: toolbar + iframe -->
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
        <v-toolbar-title>{{ t('apisix.iframeTitle') }}</v-toolbar-title>
        <v-spacer />
        <v-btn
          icon
          :href="APISIX_DASHBOARD_BASE_PATH"
          target="_blank"
          rel="noopener noreferrer"
          :title="t('apisix.openInNewTab')"
          data-testid="open-new-tab-btn"
        >
          <v-icon>mdi-open-in-new</v-icon>
        </v-btn>
      </v-toolbar>

      <iframe
        :src="iframeSrc"
        :title="t('apisix.iframeTitle')"
        :sandbox="IFRAME_SANDBOX"
        referrerpolicy="no-referrer-when-downgrade"
        loading="eager"
        :style="{ height: iframeHeight, width: '100%', border: '0' }"
        data-testid="apisix-iframe"
      />
    </template>
  </div>
</template>

<style scoped>
.apisix-view {
  outline: none;
}
</style>
