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
<template>
  <v-app>
    <!-- App bar with title, auth-token button, theme toggle, and user menu -->
    <v-app-bar
      color="primary"
      density="default"
    >
      <v-app-bar-nav-icon @click="drawer = !drawer" />
      <v-app-bar-title>{{ t('app.title') }}</v-app-bar-title>
      <v-spacer />
      <v-btn
        v-if="!isAuthEnabled"
        icon
        :aria-label="t('auth.toggle')"
        @click="openAuthDialog"
      >
        <v-icon>{{ isAuthenticated ? 'mdi-shield-lock' : 'mdi-shield-lock-open-outline' }}</v-icon>
      </v-btn>
      <v-btn
        icon
        :aria-label="t('theme.toggle')"
        @click="toggleTheme"
      >
        <v-icon>{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
      </v-btn>

      <!-- Authenticated user menu. Hidden when auth is disabled so the
           default unauthenticated-by-default deployment is unchanged. -->
      <v-menu
        v-if="isAuthEnabled && isAuthenticated && user"
        offset="8"
      >
        <template #activator="{ props: activatorProps }">
          <v-btn
            v-bind="activatorProps"
            icon
            :aria-label="t('auth.userMenu')"
            class="user-menu-activator"
          >
            <v-icon>mdi-account-circle</v-icon>
          </v-btn>
        </template>
        <v-list
          density="comfortable"
          min-width="240"
        >
          <!-- User identity header -->
          <v-list-item
            :title="user.name"
            :subtitle="t('auth.signedInAs')"
            class="user-menu-identity"
          >
            <template #prepend>
              <v-icon size="32">
                mdi-account
              </v-icon>
            </template>
          </v-list-item>

          <v-divider />

          <!-- Role row -->
          <v-list-item :title="t('auth.role')">
            <template #append>
              <v-chip
                :color="user.role === ROLE_ADMIN ? 'primary' : 'secondary'"
                size="small"
                variant="tonal"
                class="user-menu-role-chip"
              >
                {{ roleLabel }}
              </v-chip>
            </template>
          </v-list-item>

          <!-- Provider row -->
          <v-list-item
            v-if="activeProviderDisplayName"
            :title="t('auth.provider')"
            :subtitle="activeProviderDisplayName"
          />

          <v-divider />

          <!-- Sign-out action -->
          <v-list-item
            :disabled="isSigningOut"
            :title="isSigningOut ? t('auth.signingOut') : t('auth.signOut')"
            class="user-menu-signout"
            @click="handleSignOut"
          >
            <template #prepend>
              <v-icon>mdi-logout</v-icon>
            </template>
          </v-list-item>
        </v-list>
      </v-menu>
    </v-app-bar>

    <!-- Authentication token dialog -->
    <v-dialog
      v-model="showAuthDialog"
      max-width="600"
    >
      <v-card>
        <v-card-title>{{ t('auth.dialogTitle') }}</v-card-title>
        <v-card-subtitle>
          {{ isAuthenticated ? t('auth.statusAuthenticated') : t('auth.statusUnauthenticated') }}
        </v-card-subtitle>
        <v-card-text>
          <v-textarea
            v-model="tokenInput"
            :label="t('auth.tokenLabel')"
            :hint="t('auth.tokenHelp')"
            persistent-hint
            rows="4"
            auto-grow
            class="font-monospace"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            variant="text"
            @click="showAuthDialog = false"
          >
            {{ t('common.cancel') }}
          </v-btn>
          <v-btn
            color="error"
            variant="text"
            :disabled="!isAuthenticated"
            @click="handleClearToken"
          >
            {{ t('auth.clear') }}
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            @click="handleSaveToken"
          >
            {{ t('auth.save') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Navigation drawer / sidebar -->
    <v-navigation-drawer
      v-model="drawer"
      app
    >
      <v-list
        nav
        density="compact"
      >
        <v-list-item
          prepend-icon="mdi-home"
          :title="t('nav.home')"
          to="/"
        />
        <v-divider class="my-2" />
        <v-list-item
          v-if="services.til"
          prepend-icon="mdi-shield-check"
          :title="t('nav.til')"
          to="/til"
        />
        <v-list-item
          v-if="services.tir"
          prepend-icon="mdi-account-group"
          :title="t('nav.tir')"
          to="/tir"
        />
        <v-list-item
          v-if="services.ccs"
          prepend-icon="mdi-file-certificate"
          :title="t('nav.ccs')"
          to="/ccs"
        />
        <v-list-item
          v-if="services.odrl"
          prepend-icon="mdi-gavel"
          :title="t('nav.policies')"
          to="/policies"
        />
        <v-divider
          v-if="apisixVisible"
          class="my-2"
        />
        <v-list-item
          v-if="apisixVisible"
          prepend-icon="mdi-traffic-light"
          :title="t('nav.apisix')"
          :to="{ name: APISIX_DASHBOARD_ROUTE_NAME }"
          data-testid="nav-apisix"
        />
        <v-divider
          v-if="grafanaVisible"
          class="my-2"
        />
        <v-list-item
          v-if="grafanaVisible"
          prepend-icon="mdi-monitor-dashboard"
          :title="t('nav.grafana')"
          :to="{ name: GRAFANA_ROUTE_NAME }"
          data-testid="nav-grafana"
        />
      </v-list>
    </v-navigation-drawer>

    <!-- Main content area -->
    <v-main>
      <v-container fluid>
        <router-view />
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTheme } from '@/composables/useTheme'
import { useLocale } from '@/composables/useLocale'
import { useAuth } from '@/composables/useAuth'
import { useServices } from '@/composables/useServices'
import { useApisix } from '@/composables/useApisix'
import { useGrafana } from '@/composables/useGrafana'
import { useAuthStore } from '@/stores/auth'
import { ROLE_ADMIN, ROLE_VIEWER } from '@/auth/constants'
import { APISIX_DASHBOARD_ROUTE_NAME } from '@/apisix/constants'
import { GRAFANA_ROUTE_NAME } from '@/grafana/constants'

const { t } = useI18n()
const { isDark, toggleTheme, initTheme } = useTheme()
const { initLocale } = useLocale()
const { token, isAuthenticated, isAuthEnabled, setToken, clearToken, initAuth } = useAuth()
const services = useServices()
const { isVisible: apisixVisible } = useApisix()
const { isVisible: grafanaVisible } = useGrafana()
const authStore = useAuthStore()

/**
 * Reactive auth state exposed to the template.
 *
 * We wrap the Pinia-store getters in plain `computed` refs rather than
 * using `storeToRefs` so this component stays easy to mount in unit
 * tests where the store is mocked (mocks are not real Pinia instances,
 * and `storeToRefs` rejects them).
 */
const user = computed(() => authStore.user)
const activeProviderId = computed(() => authStore.activeProviderId)
const providers = computed(() => authStore.providers)

/** Controls the visibility of the navigation drawer. */
const drawer = ref(true)

/** Controls the visibility of the auth-token dialog. */
const showAuthDialog = ref(false)

/** Local, editable copy of the JWT bound to the dialog's textarea. */
const tokenInput = ref('')

/**
 * Open the auth-token dialog, seeding the textarea with the currently
 * configured token so users can inspect or edit it in place.
 */
function openAuthDialog(): void {
  tokenInput.value = token.value
  showAuthDialog.value = true
}

/**
 * Persist the value currently in the textarea as the new JWT and close the
 * dialog. An empty value clears the token.
 */
function handleSaveToken(): void {
  setToken(tokenInput.value)
  showAuthDialog.value = false
}

/**
 * Clear the stored JWT and close the dialog. The shield icon will switch to
 * its "unlocked" variant and no `Authorization` header will be emitted on
 * subsequent API calls.
 */
function handleClearToken(): void {
  clearToken()
  tokenInput.value = ''
  showAuthDialog.value = false
}

/**
 * Whether a sign-out redirect is currently being negotiated. Used to disable
 * the menu item so the user cannot click it multiple times while the browser
 * is navigating to the provider's end-session endpoint.
 */
const isSigningOut = ref(false)

/**
 * Display name of the provider that issued the active session, resolved
 * from the configured provider list. Falls back to the raw provider id
 * when no matching provider is found (should not happen in practice).
 */
const activeProviderDisplayName = computed<string | null>(() => {
  const id = activeProviderId.value
  if (id === null) {
    return null
  }
  const match = providers.value.find((p) => p.id === id)
  return match?.displayName ?? id
})

/**
 * Human-readable label for the current user's canonical role, so the
 * user menu can present "Administrator" / "Viewer" without leaking the
 * internal role identifier.
 */
const roleLabel = computed<string>(() => {
  if (user.value?.role === ROLE_ADMIN) {
    return t('auth.roleAdmin')
  }
  if (user.value?.role === ROLE_VIEWER) {
    return t('auth.roleViewer')
  }
  return ''
})

/**
 * Terminate the active session via the auth store. Any failure is already
 * captured on `authStore.error` and surfaced through the standard UI; the
 * menu item simply re-enables so the user can retry.
 */
async function handleSignOut(): Promise<void> {
  if (isSigningOut.value) {
    return
  }
  isSigningOut.value = true
  try {
    await authStore.logout()
  } catch (err) {
    // The store has already recorded the error; just log for diagnostics.
    console.warn('[auth] Logout failed:', err)
  } finally {
    isSigningOut.value = false
  }
}

onMounted(() => {
  // Load the auth token first so any early consumers (e.g. API-client token
  // resolvers or future route guards) observe the persisted value.
  initAuth()
  initTheme()
  initLocale()
  // Restore any cached OIDC session so the router guard sees the user
  // as authenticated on first paint. A failing restore is logged and
  // treated as "not signed in" — the guard will redirect to /login.
  void authStore.init().catch((err) => {
    console.warn('[auth] Failed to restore session:', err)
  })
})
</script>

<style scoped>
/*
 * Render the JWT textarea in a monospace font so tokens are easier to read
 * and inspect. The inner `<textarea>` element does not inherit the parent's
 * font-family by default, so we target it via `:deep()`.
 */
.font-monospace :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
</style>
