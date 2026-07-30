/* * Copyright 2026 Seamless Middleware Technologies S.L and/or its affiliates * and other
contributors as indicated by the @author tags. * * Licensed under the Apache License, Version 2.0
(the "License"); * you may not use this file except in compliance with the License. * You may obtain
a copy of the License at * * http://www.apache.org/licenses/LICENSE-2.0 * * Unless required by
applicable law or agreed to in writing, software * distributed under the License is distributed on
an "AS IS" BASIS, * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. * See
the License for the specific language governing permissions and * limitations under the License. */
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
      {{ isEditMode ? t('policies.editTitle') : t('policies.createTitle') }}
    </h1>

    <!-- Success snackbar -->
    <v-snackbar
      v-model="showSuccess"
      color="success"
      :timeout="SNACKBAR_TIMEOUT"
    >
      {{ successMessage }}
    </v-snackbar>

    <!-- ODRL Policy Editor (web component wrapper) -->
    <OdrlPolicyEditor
      :mode="editorMode"
      :policy-id="id ?? null"
      @policy-created="onPolicyCreated"
      @policy-updated="onPolicyUpdated"
      @editor-cancelled="onEditorCancelled"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * Policy creation / editing view.
 *
 * Renders the `OdrlPolicyEditor` web component wrapper in either `create`
 * or `edit` mode depending on the route parameters. The editor handles all
 * form rendering, validation, and API calls internally. This view is
 * responsible only for page chrome (back button, title), the admin-only
 * guard, the success snackbar, and post-save navigation.
 *
 * Service-scoped policy creation is handled natively by the editor's own
 * UI — a single `api-base-url="/api/odrl"` (the wrapper's default) is
 * used for all policy operations.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import OdrlPolicyEditor from '@/components/OdrlPolicyEditor.vue'
import type { EmbeddedEventMap } from '@seamware/odrl-policy-editor'

/** Timeout in milliseconds for the success snackbar. */
const SNACKBAR_TIMEOUT = 3000

/**
 * Route-derived props.
 *
 * - `id` is present when editing an existing policy (`/policies/:id/edit`).
 * - `serviceId` is present for service-scoped routes; the editor handles
 *   service-scoped policies natively so this prop is accepted but unused.
 */
const props = defineProps<{
  /** Policy ID for edit mode. Undefined in create mode. */
  id?: string
  /** Service ID for service-scoped routes. Accepted but unused — the editor handles service scope internally. */
  serviceId?: string
}>()

const { t } = useI18n()
const router = useRouter()

/** Role-based capability flags for the current user. */
const { canEdit } = useAuth()

/** Whether the form is in edit mode (has an `id` prop). */
const isEditMode = computed(() => !!props.id)

/**
 * Editor mode derived from the route parameters.
 * `'edit'` when a policy ID is present, `'create'` otherwise.
 */
const editorMode = computed<'create' | 'edit'>(() => (isEditMode.value ? 'edit' : 'create'))

/** Success message displayed in the snackbar. */
const successMessage = ref('')

/** Whether the success snackbar is visible. */
const showSuccess = ref(false)

/**
 * Handle the `policy-created` event from the editor.
 *
 * Shows a success snackbar and navigates to the newly created policy's
 * detail view. Falls back to the policy list if no ID is available.
 *
 * @param payload - Contains the saved `policy` object and its `id`.
 */
function onPolicyCreated(payload: EmbeddedEventMap['policy-created']): void {
  successMessage.value = t('policies.createSuccess')
  showSuccess.value = true
  if (payload?.id) {
    router.push({ name: 'policy-detail', params: { id: payload.id } })
  } else {
    router.push({ name: 'policies-list' })
  }
}

/**
 * Handle the `policy-updated` event from the editor.
 *
 * Shows a success snackbar and navigates to the updated policy's detail
 * view. Falls back to using the route's `id` prop or the policy list.
 *
 * @param payload - Contains the updated `policy` object and its `id`.
 */
function onPolicyUpdated(payload: EmbeddedEventMap['policy-updated']): void {
  successMessage.value = t('policies.updateSuccess')
  showSuccess.value = true
  const policyId = payload?.id ?? props.id
  if (policyId) {
    router.push({ name: 'policy-detail', params: { id: policyId } })
  } else {
    router.push({ name: 'policies-list' })
  }
}

/**
 * Handle the `editor-cancelled` event from the editor.
 *
 * Navigates back to the policy list.
 */
function onEditorCancelled(): void {
  router.push({ name: 'policies-list' })
}

onMounted(() => {
  // Defensive redirect: the router guard normally blocks viewers from
  // reaching the form routes, but fall back to the list view in case the
  // guard was bypassed (e.g. stale session, manual route registration).
  if (!canEdit.value) {
    router.replace({ name: 'policies-list' })
    return
  }
})
</script>
