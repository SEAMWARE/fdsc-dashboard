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
  <div>
    <!-- Back button -->
    <v-btn
      variant="text"
      prepend-icon="mdi-arrow-left"
      to="/policies"
      class="mb-4"
    >
      {{ t('common.back') }}
    </v-btn>

    <h1 class="text-h4 mb-4">
      {{ t('policies.templatesTitle') }}
    </h1>

    <!-- Success snackbar -->
    <v-snackbar
      v-model="showSuccess"
      color="success"
      :timeout="SNACKBAR_TIMEOUT"
    >
      {{ successMessage }}
    </v-snackbar>

    <!-- ODRL Policy Editor opened directly on the template-management tab.
         The policy builder, raw ODRL and template-selection tabs are hidden
         so the view is dedicated to template creation and management. -->
    <OdrlPolicyEditor
      :hide-builder-tab="true"
      :hide-raw-tab="true"
      :hide-template-tab="true"
      initial-tab="manage-templates"
      @template-created="onTemplateCreated"
      @template-updated="onTemplateUpdated"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * Template creation / management view.
 *
 * Renders the `OdrlPolicyEditor` wrapper opened directly on its
 * template-management tab, providing a dedicated entry point for creating and
 * managing ODRL policy templates. All other editor tabs are hidden so the
 * page is focused solely on templates.
 *
 * The view is responsible only for page chrome (back button, title), the
 * admin-only guard, and the success snackbar. Template CRUD is handled
 * entirely by the editor against the PAP template endpoints.
 */
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import OdrlPolicyEditor from '@/components/OdrlPolicyEditor.vue'

/** Timeout in milliseconds for the success snackbar. */
const SNACKBAR_TIMEOUT = 3000

const { t } = useI18n()
const router = useRouter()

/** Role-based capability flags for the current user. */
const { canEdit } = useAuth()

/** Success message displayed in the snackbar. */
const successMessage = ref('')

/** Whether the success snackbar is visible. */
const showSuccess = ref(false)

/**
 * Handle the `template-created` event from the editor.
 *
 * Shows a success snackbar; the editor keeps the user on the template
 * management tab so no navigation is performed.
 */
function onTemplateCreated(): void {
  successMessage.value = t('policies.templateCreateSuccess')
  showSuccess.value = true
}

/**
 * Handle the `template-updated` event from the editor.
 *
 * Shows a success snackbar; the editor keeps the user on the template
 * management tab so no navigation is performed.
 */
function onTemplateUpdated(): void {
  successMessage.value = t('policies.templateUpdateSuccess')
  showSuccess.value = true
}

onMounted(() => {
  // Defensive redirect: the router guard normally blocks viewers from
  // reaching this route, but fall back to the list view in case the guard
  // was bypassed (e.g. stale session, manual route registration).
  if (!canEdit.value) {
    router.replace({ name: 'policies-list' })
    return
  }
})
</script>
