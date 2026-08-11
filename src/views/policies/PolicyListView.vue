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
    <div class="d-flex align-center mb-4">
      <h1 class="text-h4">
        {{ t('policies.listTitle') }}
      </h1>
      <v-spacer />
      <v-btn
        v-if="canEdit"
        variant="outlined"
        color="primary"
        prepend-icon="mdi-file-document-multiple-outline"
        class="mr-2"
        :to="{ name: 'template-manage' }"
      >
        {{ t('policies.createTemplate') }}
      </v-btn>
      <v-btn
        v-if="canEdit"
        color="primary"
        prepend-icon="mdi-plus"
        :to="{ name: 'policy-create' }"
      >
        {{ t('policies.createTitle') }}
      </v-btn>
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
          @click="refreshCurrentTab()"
        >
          {{ t('common.refresh') }}
        </v-btn>
      </template>
    </v-alert>

    <!-- Tabs: Global Policies | By Service -->
    <v-tabs
      v-model="activeTab"
      class="mb-4"
    >
      <v-tab :value="TAB_GLOBAL">
        {{ t('policies.globalPolicies') }}
      </v-tab>
      <v-tab :value="TAB_BY_SERVICE">
        {{ t('policies.byService') }}
      </v-tab>
    </v-tabs>

    <!-- Global policies tab -->
    <v-window
      v-model="activeTab"
      class="mt-2"
    >
      <v-window-item :value="TAB_GLOBAL">
        <v-card>
          <v-data-table-server
            :headers="headers"
            :items="store.policies"
            :items-length="store.totalPolicies"
            :loading="store.listLoading"
            :items-per-page="store.pageSize"
            :page="store.currentPage + 1"
            item-value="id"
            hover
            class="cursor-pointer"
            @update:page="onPageChange"
            @update:items-per-page="onPageSizeChange"
            @click:row="onRowClick"
          >
            <!-- ID column -->
            <template #item.id="{ item }">
              <span class="text-body-2 font-weight-medium">
                {{ item.id }}
              </span>
            </template>

            <!-- ODRL UID column (dynamic slot name because key contains a colon) -->
            <template #[odrlUidSlot]="{ item }">
              <span class="text-body-2">
                {{ item['odrl:uid'] ?? '' }}
              </span>
            </template>

            <!-- Policy type column -->
            <template #item.policyType="{ item }">
              <v-chip
                size="small"
                variant="tonal"
                color="primary"
              >
                {{ extractPolicyType(item) }}
              </v-chip>
            </template>

            <!-- Actions column -->
            <template #item.href="{ item }">
              <v-chip
                size="small"
                variant="outlined"
                color="primary"
                @click.stop="navigateToDetail(item.id ?? '')"
              >
                {{ t('common.details') }}
              </v-chip>
            </template>

            <!-- Empty state -->
            <template #no-data>
              <div class="text-center pa-8">
                <v-icon
                  size="64"
                  color="grey-lighten-1"
                  class="mb-4"
                >
                  mdi-gavel
                </v-icon>
                <p class="text-h6 text-medium-emphasis">
                  {{ t('policies.noPolicies') }}
                </p>
              </div>
            </template>

            <!-- Loading state -->
            <template #loading>
              <v-skeleton-loader type="table-row@5" />
            </template>
          </v-data-table-server>
        </v-card>
      </v-window-item>

      <!-- By-service tab -->
      <v-window-item :value="TAB_BY_SERVICE">
        <!-- Create service form -->
        <v-card
          v-if="canEdit"
          class="mb-4"
        >
          <v-card-text>
            <div class="d-flex align-center ga-3">
              <v-text-field
                v-model="newServiceId"
                :label="t('policies.serviceName')"
                variant="outlined"
                density="comfortable"
                hide-details
                class="flex-grow-1"
              />
              <v-btn
                color="primary"
                prepend-icon="mdi-plus"
                :loading="store.savingService"
                :disabled="!newServiceId.trim()"
                @click="handleCreateService"
              >
                {{ t('policies.createService') }}
              </v-btn>
            </div>
          </v-card-text>
        </v-card>

        <!-- Service error -->
        <v-alert
          v-if="store.serviceError"
          type="error"
          variant="tonal"
          closable
          class="mb-4"
          @click:close="store.serviceError = null"
        >
          {{ store.serviceError }}
        </v-alert>

        <!-- Service success snackbar -->
        <v-snackbar
          v-model="showServiceSuccess"
          color="success"
          :timeout="SNACKBAR_TIMEOUT"
        >
          {{ serviceSuccessMessage }}
        </v-snackbar>

        <!-- Services loading -->
        <template v-if="store.servicesLoading">
          <v-skeleton-loader
            type="card"
            class="mb-4"
          />
          <v-skeleton-loader type="card" />
        </template>

        <!-- Services list -->
        <template v-else-if="store.services.length > 0">
          <v-card
            v-for="service in store.services"
            :key="service.id ?? ''"
            class="mb-4"
          >
            <v-card-title class="d-flex align-center">
              <v-icon start>
                mdi-folder-outline
              </v-icon>
              {{ service.id }}
              <v-spacer />
              <v-btn
                v-if="canEdit"
                color="primary"
                variant="tonal"
                size="small"
                prepend-icon="mdi-plus"
                class="mr-2"
                @click="navigateToCreateServicePolicy(service.id ?? '')"
              >
                {{ t('policies.createTitle') }}
              </v-btn>
              <v-btn
                v-if="canDelete"
                color="error"
                variant="tonal"
                size="small"
                prepend-icon="mdi-delete"
                :loading="store.savingService"
                @click="confirmDeleteService(service.id ?? '')"
              >
                {{ t('policies.deleteService') }}
              </v-btn>
            </v-card-title>
            <v-card-text v-if="service.policyPath">
              <span class="text-caption text-medium-emphasis">
                {{ service.policyPath }}
              </span>
            </v-card-text>

            <!-- Inline policies for this service -->
            <v-card-text v-if="servicePoliciesMap[service.id ?? '']">
              <v-data-table-server
                :headers="headers"
                :items="servicePoliciesMap[service.id ?? '']?.policies ?? []"
                :items-length="servicePoliciesMap[service.id ?? '']?.total ?? 0"
                :loading="servicePoliciesMap[service.id ?? '']?.loading ?? false"
                :items-per-page="store.pageSize"
                :page="(servicePoliciesMap[service.id ?? '']?.currentPage ?? 0) + 1"
                item-value="id"
                hover
                class="cursor-pointer"
                @update:page="onServicePageChange.bind(null, service.id ?? '')"
                @update:items-per-page="onServicePageSizeChange.bind(null, service.id ?? '')"
                @click:row="onServiceRowClick.bind(null, service.id ?? '')"
              >
                <!-- ID column -->
                <template #item.id="{ item }">
                  <span class="text-body-2 font-weight-medium">
                    {{ item.id }}
                  </span>
                </template>

                <!-- ODRL UID column -->
                <template #[odrlUidSlot]="{ item }">
                  <span class="text-body-2">
                    {{ item['odrl:uid'] ?? '' }}
                  </span>
                </template>

                <!-- Policy type column -->
                <template #item.policyType="{ item }">
                  <v-chip
                    size="small"
                    variant="tonal"
                    color="primary"
                  >
                    {{ extractPolicyType(item) }}
                  </v-chip>
                </template>

                <!-- Actions column -->
                <template #item.href="{ item }">
                  <v-chip
                    size="small"
                    variant="outlined"
                    color="primary"
                    @click.stop="navigateToServicePolicyDetail(service.id ?? '', item.id ?? '')"
                  >
                    {{ t('common.details') }}
                  </v-chip>
                </template>

                <!-- Empty state -->
                <template #no-data>
                  <div class="text-center pa-4">
                    <p class="text-body-2 text-medium-emphasis">
                      {{ t('policies.noPolicies') }}
                    </p>
                  </div>
                </template>

                <!-- Loading state -->
                <template #loading>
                  <v-skeleton-loader type="table-row@3" />
                </template>
              </v-data-table-server>
            </v-card-text>
          </v-card>
        </template>

        <!-- No services -->
        <v-card v-else>
          <v-card-text class="text-center pa-8">
            <v-icon
              size="64"
              color="grey-lighten-1"
              class="mb-4"
            >
              mdi-folder-open-outline
            </v-icon>
            <p class="text-h6 text-medium-emphasis">
              {{ t('policies.noServices') }}
            </p>
          </v-card-text>
        </v-card>

        <!-- Delete service confirmation dialog -->
        <v-dialog
          v-model="showDeleteServiceDialog"
          max-width="500"
        >
          <v-card>
            <v-card-title>{{ t('common.confirmDelete') }}</v-card-title>
            <v-card-text>
              {{ t('policies.confirmDeleteService') }}
              <br>
              <span class="text-medium-emphasis text-body-2">
                {{ t('common.deleteWarning') }}
              </span>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn
                variant="text"
                @click="showDeleteServiceDialog = false"
              >
                {{ t('common.cancel') }}
              </v-btn>
              <v-btn
                color="error"
                variant="flat"
                :loading="store.savingService"
                @click="handleDeleteService"
              >
                {{ t('common.delete') }}
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </v-window-item>
    </v-window>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed, ref, watch, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { usePoliciesStore } from '@/stores/policies'
import { useAuth } from '@/composables/useAuth'
import type { Policy } from '@/api/generated/odrl'

/** Fallback value when the ODRL type cannot be determined. */
const UNKNOWN_TYPE = 'Unknown'

/** Dynamic slot name for the ODRL UID column (key contains a colon). */
const odrlUidSlot = 'item.odrl:uid'

/** Tab identifier for the global policies view. */
const TAB_GLOBAL = 'global'

/** Tab identifier for the by-service view. */
const TAB_BY_SERVICE = 'by-service'

/** Timeout in milliseconds for the success snackbar. */
const SNACKBAR_TIMEOUT = 3000

const { t } = useI18n()
const router = useRouter()
const store = usePoliciesStore()

/** Role-based capability flags for the current user. */
const { canEdit, canDelete } = useAuth()

/** Currently active tab. */
const activeTab = ref(TAB_GLOBAL)

/** New service ID for creation. */
const newServiceId = ref('')

/** Whether to show the delete-service confirmation dialog. */
const showDeleteServiceDialog = ref(false)

/** ID of the service pending deletion. */
const serviceToDelete = ref('')

/** Whether the service success snackbar is visible. */
const showServiceSuccess = ref(false)

/** Success message for service operations. */
const serviceSuccessMessage = ref('')

/** Per-service policy lists keyed by service ID. */
const servicePoliciesMap = reactive<Record<string, {
  policies: Policy[]
  total: number
  loading: boolean
  currentPage: number
}>>({})

/** Column definitions for the policies data table. */
const headers = computed(() => [
  { title: t('policies.policyId'), key: 'id', sortable: false },
  { title: t('policies.odrlUid'), key: 'odrl:uid', sortable: false },
  { title: t('policies.policyType'), key: 'policyType', sortable: false, width: '140px' },
  {
    title: '',
    key: 'href',
    sortable: false,
    align: 'end' as const,
    width: '120px',
  },
])

/**
 * Extract the ODRL policy type from the policy's `odrl` JSON string.
 *
 * Parses the `odrl` field and reads the `@type` property.
 * Returns a fallback string if parsing fails or the field is absent.
 *
 * @param policy - The policy to extract the type from.
 * @returns The ODRL policy type (e.g. "Set", "Offer", "Agreement").
 */
function extractPolicyType(policy: Policy): string {
  if (!policy.odrl) {
    return UNKNOWN_TYPE
  }
  try {
    const parsed = JSON.parse(policy.odrl)
    return parsed['@type'] ?? UNKNOWN_TYPE
  } catch {
    return UNKNOWN_TYPE
  }
}

/** Navigate to the detail view for a given policy ID. */
function navigateToDetail(id: string): void {
  router.push({ name: 'policy-detail', params: { id } })
}

/** Navigate to the detail view for the selected policy (row click handler). */
function onRowClick(_event: Event, row: { item: Policy }): void {
  navigateToDetail(row.item.id ?? '')
}

/** Handle page change from the data table. */
function onPageChange(page: number): void {
  store.fetchPolicies(page - 1)
}

/** Handle page size change from the data table. */
function onPageSizeChange(size: number): void {
  store.fetchPolicies(0, size)
}

/** Navigate to the detail view for a service policy. */
function navigateToServicePolicyDetail(serviceId: string, policyId: string): void {
  router.push({ name: 'service-policy-detail', params: { serviceId, id: policyId } })
}

/** Row click handler for a service policy table. */
function onServiceRowClick(serviceId: string, _event: Event, row: { item: Policy }): void {
  navigateToServicePolicyDetail(serviceId, row.item.id ?? '')
}

/** Navigate to the create form for a service policy. */
function navigateToCreateServicePolicy(serviceId: string): void {
  router.push({ name: 'service-policy-create', params: { serviceId } })
}

/** Refresh the currently active tab's data. */
function refreshCurrentTab(): void {
  if (activeTab.value === TAB_GLOBAL) {
    store.fetchPolicies()
  } else {
    store.fetchServices()
  }
}

/**
 * Fetch policies for a specific service and update the local map.
 *
 * @param serviceId - The service to fetch policies for.
 * @param page - Zero-based page index.
 * @param size - Page size.
 */
async function fetchServicePolicies(serviceId: string, page = 0, size?: number): Promise<void> {
  const pageSize = size ?? store.pageSize
  if (!servicePoliciesMap[serviceId]) {
    servicePoliciesMap[serviceId] = { policies: [], total: 0, loading: false, currentPage: 0 }
  }
  servicePoliciesMap[serviceId].loading = true
  try {
    const items = await store.fetchServicePolicies(serviceId, page, pageSize)
    servicePoliciesMap[serviceId].policies = items
    servicePoliciesMap[serviceId].currentPage = page
    if (items.length >= pageSize) {
      servicePoliciesMap[serviceId].total = (page + 2) * pageSize
    } else {
      servicePoliciesMap[serviceId].total = page * pageSize + items.length
    }
  } finally {
    servicePoliciesMap[serviceId].loading = false
  }
}

/** Handle page change for a service policy table. */
function onServicePageChange(serviceId: string, page: number): void {
  fetchServicePolicies(serviceId, page - 1)
}

/** Handle page size change for a service policy table. */
function onServicePageSizeChange(serviceId: string, size: number): void {
  fetchServicePolicies(serviceId, 0, size)
}

/** Create a new service from the input field. */
async function handleCreateService(): Promise<void> {
  const id = newServiceId.value.trim()
  if (!id) return
  const success = await store.createService(id)
  if (success) {
    newServiceId.value = ''
    serviceSuccessMessage.value = t('policies.createServiceSuccess')
    showServiceSuccess.value = true
    await store.fetchServices()
  }
}

/** Open the delete confirmation dialog for a service. */
function confirmDeleteService(serviceId: string): void {
  serviceToDelete.value = serviceId
  showDeleteServiceDialog.value = true
}

/** Delete the service after user confirmation. */
async function handleDeleteService(): Promise<void> {
  const success = await store.deleteService(serviceToDelete.value)
  showDeleteServiceDialog.value = false
  if (success) {
    serviceSuccessMessage.value = t('policies.deleteServiceSuccess')
    showServiceSuccess.value = true
    delete servicePoliciesMap[serviceToDelete.value]
    await store.fetchServices()
  }
}

/** When the by-service tab is activated, fetch services and their policies. */
watch(activeTab, async (tab) => {
  if (tab === TAB_BY_SERVICE && store.services.length === 0) {
    await store.fetchServices()
    for (const svc of store.services) {
      if (svc.id) {
        fetchServicePolicies(svc.id)
      }
    }
  }
})

/** After services are fetched, load their policies. */
watch(() => store.services, (services) => {
  for (const svc of services) {
    if (svc.id && !servicePoliciesMap[svc.id]) {
      fetchServicePolicies(svc.id)
    }
  }
})

onMounted(() => {
  store.fetchPolicies()
})
</script>
