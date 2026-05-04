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
    <h1 class="text-h4 mb-2">
      {{ t('home.title') }}
    </h1>
    <p class="text-subtitle-1 text-medium-emphasis mb-6">
      {{ t('home.subtitle') }}
    </p>

    <v-row>
      <!-- Trusted Issuers card -->
      <v-col
        v-if="services.til"
        cols="12"
        md="3"
      >
        <v-card
          hover
          class="resource-card"
        >
          <v-card-item>
            <template #prepend>
              <v-icon
                size="48"
                color="primary"
              >
                mdi-shield-check
              </v-icon>
            </template>
            <v-card-title class="text-h6">
              {{ t('nav.til') }}
            </v-card-title>
            <v-card-subtitle>
              {{ t('home.tilDescription') }}
            </v-card-subtitle>
          </v-card-item>

          <v-card-text>
            <div class="d-flex align-center">
              <v-skeleton-loader
                v-if="tilStore.listLoading"
                type="text"
                width="60"
              />
              <span
                v-else-if="!tilStore.listError"
                class="text-h4 font-weight-bold text-primary"
              >
                {{ tilStore.totalIssuers }}
              </span>
              <v-icon
                v-else
                color="error"
                size="24"
              >
                mdi-alert-circle-outline
              </v-icon>
              <span class="text-body-2 text-medium-emphasis ml-2">
                {{ t('home.resourceCount') }}
              </span>
            </div>
          </v-card-text>

          <v-card-actions>
            <v-btn
              variant="text"
              color="primary"
              :to="{ name: 'til-list' }"
            >
              {{ t('home.viewAll') }}
              <v-icon end>
                mdi-arrow-right
              </v-icon>
            </v-btn>
            <v-spacer />
            <v-btn
              variant="tonal"
              color="primary"
              size="small"
              prepend-icon="mdi-plus"
              :to="{ name: 'til-create' }"
            >
              {{ t('common.create') }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>

      <!-- Participants List card -->
      <v-col
        v-if="services.tir"
        cols="12"
        md="3"
      >
        <v-card
          hover
          class="resource-card"
        >
          <v-card-item>
            <template #prepend>
              <v-icon
                size="48"
                color="primary"
              >
                mdi-account-group
              </v-icon>
            </template>
            <v-card-title class="text-h6">
              {{ t('nav.tir') }}
            </v-card-title>
            <v-card-subtitle>
              {{ t('home.tirDescription') }}
            </v-card-subtitle>
          </v-card-item>

          <v-card-text>
            <div class="d-flex align-center">
              <v-skeleton-loader
                v-if="tirStore.listLoading"
                type="text"
                width="60"
              />
              <span
                v-else-if="!tirStore.listError"
                class="text-h4 font-weight-bold text-primary"
              >
                {{ tirStore.totalParticipants }}
              </span>
              <v-icon
                v-else
                color="error"
                size="24"
              >
                mdi-alert-circle-outline
              </v-icon>
              <span class="text-body-2 text-medium-emphasis ml-2">
                {{ t('home.resourceCount') }}
              </span>
            </div>
          </v-card-text>

          <v-card-actions>
            <v-btn
              variant="text"
              color="primary"
              :to="{ name: 'tir-list' }"
            >
              {{ t('home.viewAll') }}
              <v-icon end>
                mdi-arrow-right
              </v-icon>
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>

      <!-- Credentials Config card -->
      <v-col
        v-if="services.ccs"
        cols="12"
        md="3"
      >
        <v-card
          hover
          class="resource-card"
        >
          <v-card-item>
            <template #prepend>
              <v-icon
                size="48"
                color="primary"
              >
                mdi-file-certificate
              </v-icon>
            </template>
            <v-card-title class="text-h6">
              {{ t('nav.ccs') }}
            </v-card-title>
            <v-card-subtitle>
              {{ t('home.ccsDescription') }}
            </v-card-subtitle>
          </v-card-item>

          <v-card-text>
            <div class="d-flex align-center">
              <v-skeleton-loader
                v-if="ccsStore.listLoading"
                type="text"
                width="60"
              />
              <span
                v-else-if="!ccsStore.listError"
                class="text-h4 font-weight-bold text-primary"
              >
                {{ ccsStore.totalServices }}
              </span>
              <v-icon
                v-else
                color="error"
                size="24"
              >
                mdi-alert-circle-outline
              </v-icon>
              <span class="text-body-2 text-medium-emphasis ml-2">
                {{ t('home.resourceCount') }}
              </span>
            </div>
          </v-card-text>

          <v-card-actions>
            <v-btn
              variant="text"
              color="primary"
              :to="{ name: 'ccs-list' }"
            >
              {{ t('home.viewAll') }}
              <v-icon end>
                mdi-arrow-right
              </v-icon>
            </v-btn>
            <v-spacer />
            <v-btn
              variant="tonal"
              color="primary"
              size="small"
              prepend-icon="mdi-plus"
              :to="{ name: 'ccs-create' }"
            >
              {{ t('common.create') }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>

      <!-- ODRL Policies card -->
      <v-col
        v-if="services.odrl"
        cols="12"
        md="3"
      >
        <v-card
          hover
          class="resource-card"
        >
          <v-card-item>
            <template #prepend>
              <v-icon
                size="48"
                color="primary"
              >
                mdi-gavel
              </v-icon>
            </template>
            <v-card-title class="text-h6">
              {{ t('nav.policies') }}
            </v-card-title>
            <v-card-subtitle>
              {{ t('home.policiesDescription') }}
            </v-card-subtitle>
          </v-card-item>

          <v-card-text>
            <div class="d-flex align-center">
              <v-skeleton-loader
                v-if="policiesStore.listLoading"
                type="text"
                width="60"
              />
              <span
                v-else-if="!policiesStore.listError"
                class="text-h4 font-weight-bold text-primary"
              >
                {{ policiesStore.totalPolicies }}
              </span>
              <v-icon
                v-else
                color="error"
                size="24"
              >
                mdi-alert-circle-outline
              </v-icon>
              <span class="text-body-2 text-medium-emphasis ml-2">
                {{ t('home.resourceCount') }}
              </span>
            </div>
          </v-card-text>

          <v-card-actions>
            <v-btn
              variant="text"
              color="primary"
              :to="{ name: 'policies-list' }"
            >
              {{ t('home.viewAll') }}
              <v-icon end>
                mdi-arrow-right
              </v-icon>
            </v-btn>
            <v-spacer />
            <v-btn
              variant="tonal"
              color="primary"
              size="small"
              prepend-icon="mdi-plus"
              :to="{ name: 'policy-create' }"
            >
              {{ t('common.create') }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>

      <!-- Apisix Dashboard card (visible to admins when configured) -->
      <v-col
        v-if="apisixVisible"
        cols="12"
        md="4"
      >
        <v-card
          hover
          class="resource-card"
          data-testid="apisix-card"
        >
          <v-card-item>
            <template #prepend>
              <v-icon
                size="48"
                color="primary"
              >
                mdi-traffic-light
              </v-icon>
            </template>
            <v-card-title class="text-h6">
              {{ t('nav.apisix') }}
            </v-card-title>
            <v-card-subtitle>
              {{ t('home.apisixDescription') }}
            </v-card-subtitle>
          </v-card-item>

          <v-card-actions>
            <v-btn
              variant="text"
              color="primary"
              :to="{ name: APISIX_DASHBOARD_ROUTE_NAME }"
            >
              {{ t('home.viewAll') }}
              <v-icon end>
                mdi-arrow-right
              </v-icon>
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>

      <!-- Grafana Dashboards card (visible to authenticated users when configured) -->
      <v-col
        v-if="grafanaVisible"
        cols="12"
        md="4"
      >
        <v-card
          hover
          class="resource-card"
          data-testid="grafana-card"
        >
          <v-card-item>
            <template #prepend>
              <v-icon
                size="48"
                color="primary"
              >
                mdi-monitor-dashboard
              </v-icon>
            </template>
            <v-card-title class="text-h6">
              {{ t('nav.grafana') }}
            </v-card-title>
            <v-card-subtitle>
              {{ t('home.grafanaDescription') }}
            </v-card-subtitle>
          </v-card-item>

          <v-card-actions>
            <v-btn
              variant="text"
              color="primary"
              :to="{ name: GRAFANA_ROUTE_NAME }"
            >
              {{ t('home.viewAll') }}
              <v-icon end>
                mdi-arrow-right
              </v-icon>
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTilStore } from '@/stores/til'
import { useTirStore } from '@/stores/tir'
import { useCcsStore } from '@/stores/ccs'
import { usePoliciesStore } from '@/stores/policies'
import { useServices } from '@/composables/useServices'
import { useApisix } from '@/composables/useApisix'
import { useGrafana } from '@/composables/useGrafana'
import { APISIX_DASHBOARD_ROUTE_NAME } from '@/apisix/constants'
import { GRAFANA_ROUTE_NAME } from '@/grafana/constants'

const { t } = useI18n()
const services = useServices()
const tilStore = useTilStore()
const tirStore = useTirStore()
const ccsStore = useCcsStore()
const policiesStore = usePoliciesStore()
const { isVisible: apisixVisible } = useApisix()
const { isVisible: grafanaVisible } = useGrafana()

/**
 * Fetch initial resource counts from enabled stores on mount.
 * Uses a minimal page size of 1 to reduce payload while still
 * obtaining the total count from the API response.
 */
onMounted(() => {
  /** Minimum page size to fetch only the total count. */
  const MINIMAL_PAGE_SIZE = 1
  if (services.til) tilStore.fetchIssuers(0, MINIMAL_PAGE_SIZE)
  if (services.tir) tirStore.fetchParticipants(0, MINIMAL_PAGE_SIZE)
  if (services.ccs) ccsStore.fetchServices(0, MINIMAL_PAGE_SIZE)
  if (services.odrl) policiesStore.fetchPolicies(0, MINIMAL_PAGE_SIZE)
})
</script>

<style scoped>
.resource-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.resource-card .v-card-actions {
  margin-top: auto;
}
</style>
