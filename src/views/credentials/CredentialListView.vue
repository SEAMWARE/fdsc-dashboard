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
<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h4">
        {{ t('credentials.listTitle') }}
      </h1>
    </div>

    <!-- Error alert -->
    <v-alert
      v-if="store.listError"
      type="error"
      variant="tonal"
      closable
      class="mb-4"
      @click:close="store.listError = null"
    >
      {{ store.listError }}
      <template #append>
        <v-btn
          variant="text"
          size="small"
          @click="refreshList()"
        >
          {{ t('common.refresh') }}
        </v-btn>
      </template>
    </v-alert>

    <!-- Update error alert -->
    <v-alert
      v-if="store.updateError"
      type="error"
      variant="tonal"
      closable
      class="mb-4"
      @click:close="store.updateError = null"
    >
      {{ store.updateError }}
    </v-alert>

    <!-- Filter card -->
    <v-card class="mb-4">
      <v-card-text>
        <v-row
          dense
          align="center"
        >
          <v-col
            cols="12"
            sm="4"
          >
            <v-text-field
              v-model="store.filterUsername"
              :label="t('credentials.filterUsername')"
              variant="outlined"
              density="comfortable"
              hide-details
              clearable
              prepend-inner-icon="mdi-account-search"
              @keyup.enter="applyFilters"
              @click:clear="onClearUsername"
            />
          </v-col>
          <v-col
            cols="12"
            sm="2"
          >
            <v-select
              v-model="store.filterStatus"
              :label="t('credentials.filterStatus')"
              :items="statusFilterOptions"
              variant="outlined"
              density="comfortable"
              hide-details
              clearable
              @update:model-value="applyFilters"
            />
          </v-col>
          <v-col
            cols="12"
            sm="2"
          >
            <v-select
              v-model="store.filterType"
              :label="t('credentials.filterType')"
              :items="store.knownTypes"
              variant="outlined"
              density="comfortable"
              hide-details
              clearable
              @update:model-value="applyFilters"
            />
          </v-col>
          <v-col
            cols="12"
            sm="2"
          >
            <v-text-field
              v-model="store.filterClaims"
              :label="t('credentials.filterClaims')"
              :hint="t('credentials.filterClaimsHint')"
              variant="outlined"
              density="comfortable"
              hide-details
              clearable
              @keyup.enter="applyFilters"
              @click:clear="onClearClaims"
            />
          </v-col>
          <v-col
            cols="12"
            sm="2"
            class="d-flex ga-2"
          >
            <v-btn
              color="primary"
              variant="flat"
              @click="applyFilters"
            >
              {{ t('credentials.applyFilter') }}
            </v-btn>
            <v-btn
              variant="text"
              @click="handleResetFilters"
            >
              {{ t('common.reset') }}
            </v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Credentials data table -->
    <v-card>
      <v-data-table-server
        :headers="headers"
        :items="store.credentials"
        :items-length="store.totalCredentials"
        :loading="store.listLoading"
        :items-per-page="store.pageSize"
        :page="store.currentPage + 1"
        item-value="id"
        hover
        @update:page="onPageChange"
        @update:items-per-page="onPageSizeChange"
      >
        <!-- Username column -->
        <template #item.username="{ item }">
          <span class="text-body-2 font-weight-medium">
            {{ item.username ?? '—' }}
          </span>
        </template>

        <!-- Status column with toggle -->
        <template #item.status="{ item }">
          <v-chip
            :color="item.status === STATUS_VALID ? 'success' : 'error'"
            size="small"
            variant="tonal"
            class="cursor-pointer"
            :loading="store.updating"
            @click="confirmToggle(item)"
          >
            {{ item.status }}
            <template #append>
              <v-icon
                size="small"
                class="ml-1"
              >
                mdi-swap-horizontal
              </v-icon>
            </template>
          </v-chip>
        </template>

        <!-- Credential type column -->
        <template #item.credentialType="{ item }">
          <v-chip
            v-for="ct in store.extractTypes(item)"
            :key="ct"
            size="small"
            variant="tonal"
            class="mr-1"
          >
            {{ ct }}
          </v-chip>
          <span
            v-if="store.extractTypes(item).length === 0"
            class="text-body-2 text-medium-emphasis"
          >
            —
          </span>
        </template>

        <!-- Created timestamp column -->
        <template #item.created_timestamp="{ item }">
          <span class="text-body-2">
            {{ formatTimestamp(item.created_timestamp) }}
          </span>
        </template>

        <!-- Metadata column -->
        <template #item.metadata="{ item }">
          <span
            v-if="item.metadata && formatMetadata(item.metadata)"
            class="text-body-2 text-truncate d-inline-block"
            style="max-width: 300px"
            :title="formatMetadata(item.metadata)"
          >
            {{ formatMetadata(item.metadata) }}
          </span>
          <span
            v-else
            class="text-body-2 text-medium-emphasis"
          >
            —
          </span>
        </template>

        <!-- Empty state -->
        <template #no-data>
          <div class="text-center pa-8">
            <v-icon
              size="64"
              color="grey-lighten-1"
              class="mb-4"
            >
              mdi-certificate-outline
            </v-icon>
            <p class="text-h6 text-medium-emphasis">
              {{ t('credentials.noCredentials') }}
            </p>
          </div>
        </template>

        <!-- Loading state -->
        <template #loading>
          <v-skeleton-loader type="table-row@5" />
        </template>
      </v-data-table-server>
    </v-card>

    <!-- Status toggle confirmation dialog -->
    <v-dialog
      v-model="showToggleDialog"
      max-width="500"
    >
      <v-card>
        <v-card-title>{{ t('credentials.confirmStatusChange') }}</v-card-title>
        <v-card-text>
          {{ t('credentials.confirmStatusChangeMessage', {
            username: toggleTarget?.username ?? toggleTarget?.user_id ?? '',
            from: toggleTarget?.status ?? '',
            to: toggleNewStatus,
          }) }}
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            variant="text"
            @click="showToggleDialog = false"
          >
            {{ t('common.cancel') }}
          </v-btn>
          <v-btn
            :color="toggleNewStatus === STATUS_VALID ? 'success' : 'error'"
            variant="flat"
            :loading="store.updating"
            @click="executeToggle"
          >
            {{ t('credentials.setStatus', { status: toggleNewStatus }) }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Success snackbar -->
    <v-snackbar
      v-model="showSuccess"
      color="success"
      :timeout="SNACKBAR_TIMEOUT"
    >
      {{ successMessage }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCredentialsStore } from '@/stores/credentials'
import { useAuth } from '@/composables/useAuth'
import type { CredentialStatusEntry, CredentialStatus } from '@/api/credentials'

/** Timeout in milliseconds for the success snackbar. */
const SNACKBAR_TIMEOUT = 3000

/** Status value representing a valid credential. */
const STATUS_VALID: CredentialStatus = 'VALID'

/** Status value representing an invalid/revoked credential. */
const STATUS_INVALID: CredentialStatus = 'INVALID'

const { t } = useI18n()
const store = useCredentialsStore()
const { keycloakRealm } = useAuth()

/** The resolved realm name used for all API calls. */
const realm = computed(() => keycloakRealm.value ?? '')

/** Options for the status filter dropdown. */
const statusFilterOptions = computed(() => [
  { title: t('credentials.statusValid'), value: STATUS_VALID },
  { title: t('credentials.statusInvalid'), value: STATUS_INVALID },
])

/** Column definitions for the credentials data table. */
const headers = computed(() => [
  { title: t('credentials.username'), key: 'username', sortable: false },
  { title: t('credentials.status'), key: 'status', sortable: false, width: '140px' },
  { title: t('credentials.credentialType'), key: 'credentialType', sortable: false },
  { title: t('credentials.tokenId'), key: 'token_id', sortable: false },
  { title: t('credentials.createdAt'), key: 'created_timestamp', sortable: false, width: '180px' },
  { title: t('credentials.metadata'), key: 'metadata', sortable: false },
])

/** Whether the status toggle confirmation dialog is visible. */
const showToggleDialog = ref(false)

/** The credential entry being toggled. */
const toggleTarget = ref<CredentialStatusEntry | null>(null)

/** The new status to set on the toggle target. */
const toggleNewStatus = ref<CredentialStatus>(STATUS_INVALID)

/** Whether the success snackbar is visible. */
const showSuccess = ref(false)

/** Success message for the snackbar. */
const successMessage = ref('')

/**
 * Format a Unix epoch millisecond timestamp as a locale date/time string.
 *
 * @param timestamp - Unix epoch milliseconds.
 * @returns Formatted date/time string.
 */
function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

/** Metadata key shown in its own dedicated column. */
const METADATA_TYPE_KEY = 'type'

/**
 * Format a metadata object as a compact string for table display,
 * excluding the `type` key which is rendered in the credential type column.
 *
 * @param metadata - The metadata object.
 * @returns A JSON string representation, or an empty string when only `type` was present.
 */
function formatMetadata(metadata: Record<string, unknown>): string {
  const filtered = Object.fromEntries(
    Object.entries(metadata).filter(([k]) => k !== METADATA_TYPE_KEY),
  )
  return Object.keys(filtered).length > 0 ? JSON.stringify(filtered) : ''
}

/** Refresh the list with current filters. */
function refreshList(): void {
  if (realm.value) {
    store.fetchCredentials(realm.value)
  }
}

/** Apply current filters and reload from page zero. */
function applyFilters(): void {
  if (realm.value) {
    store.fetchCredentials(realm.value, 0)
  }
}

/** Handle clearing the username filter. */
function onClearUsername(): void {
  store.filterUsername = ''
  applyFilters()
}

/** Handle clearing the claims filter. */
function onClearClaims(): void {
  store.filterClaims = ''
  applyFilters()
}

/** Reset all filters and reload. */
function handleResetFilters(): void {
  if (realm.value) {
    store.resetFilters(realm.value)
  }
}

/** Handle page change from the data table. */
function onPageChange(page: number): void {
  if (realm.value) {
    store.fetchCredentials(realm.value, page - 1)
  }
}

/** Handle page size change from the data table. */
function onPageSizeChange(size: number): void {
  if (realm.value) {
    store.fetchCredentials(realm.value, 0, size)
  }
}

/**
 * Open the confirmation dialog for toggling a credential's status.
 *
 * @param entry - The credential entry to toggle.
 */
function confirmToggle(entry: CredentialStatusEntry): void {
  toggleTarget.value = entry
  toggleNewStatus.value = entry.status === STATUS_VALID ? STATUS_INVALID : STATUS_VALID
  showToggleDialog.value = true
}

/** Execute the status toggle after user confirmation. */
async function executeToggle(): Promise<void> {
  if (!toggleTarget.value || !realm.value) {
    return
  }
  const success = await store.toggleStatus(
    realm.value,
    toggleTarget.value.id,
    toggleNewStatus.value,
  )
  showToggleDialog.value = false
  if (success) {
    successMessage.value = t('credentials.statusUpdateSuccess', {
      status: toggleNewStatus.value,
    })
    showSuccess.value = true
  }
}

onMounted(() => {
  if (realm.value) {
    store.fetchCredentials(realm.value)
  }
})
</script>
