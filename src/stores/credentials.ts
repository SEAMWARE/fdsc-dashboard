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
 * Pinia store for Verifiable Credential status management.
 *
 * Provides paginated listing with filters (username, status, claims) and
 * status toggling (VALID ↔ INVALID) via the Keycloak Token Status List
 * admin API.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  fetchCredentialStatuses,
  updateCredentialStatus,
  CredentialApiError,
  type CredentialStatusEntry,
  type CredentialStatus,
  type CredentialStatusFilter,
} from '@/api/credentials'

/** Default number of entries per page. */
const DEFAULT_PAGE_SIZE = 20

/** Maximum number of entries per page accepted by the API. */
const MAX_PAGE_SIZE = 100

export const useCredentialsStore = defineStore('credentials', () => {
  // ── List state ──────────────────────────────────────────────────────
  /** Array of credential entries for the current page. */
  const credentials = ref<CredentialStatusEntry[]>([])
  /** Total number of credential entries across all pages. */
  const totalCredentials = ref(0)
  /** Number of entries displayed per page. */
  const pageSize = ref(DEFAULT_PAGE_SIZE)
  /** Current zero-based page index. */
  const currentPage = ref(0)
  /** Whether the list is currently being fetched. */
  const listLoading = ref(false)
  /** Error message from the last list fetch, or null if successful. */
  const listError = ref<string | null>(null)

  // ── Filter state ────────────────────────────────────────────────────
  /** Username filter for the credential list. */
  const filterUsername = ref('')
  /** Status filter for the credential list (empty = all). */
  const filterStatus = ref<CredentialStatus | ''>('')
  /** Credential type filter for the credential list (empty = all). */
  const filterType = ref('')
  /** Claims filter for the credential list. */
  const filterClaims = ref('')

  // ── Update state ────────────────────────────────────────────────────
  /** Whether a status update operation is in progress. */
  const updating = ref(false)
  /** Error message from the last status update, or null if successful. */
  const updateError = ref<string | null>(null)

  /** Whether the credentials list is empty (after a successful fetch). */
  const isEmpty = computed(() => !listLoading.value && credentials.value.length === 0)

  /** Total number of pages based on current page size. */
  const totalPages = computed(() =>
    Math.max(1, Math.ceil(totalCredentials.value / pageSize.value)),
  )

  /** Unique credential types collected from fetched entries. */
  const knownTypes = ref<string[]>([])

  /**
   * Extract distinct credential types from an entry's `metadata.type` array,
   * excluding the generic `VerifiableCredential` base type.
   *
   * @param entry - A credential status entry.
   * @returns Array of specific credential type strings.
   */
  function extractTypes(entry: CredentialStatusEntry): string[] {
    const metadataType = entry.metadata?.type
    if (!Array.isArray(metadataType)) {
      return []
    }
    return metadataType.filter(
      (t): t is string => typeof t === 'string' && t !== 'VerifiableCredential',
    )
  }

  /**
   * Update the set of known credential types from the current page of entries.
   */
  function updateKnownTypes(): void {
    const seen = new Set(knownTypes.value)
    for (const entry of credentials.value) {
      for (const t of extractTypes(entry)) {
        seen.add(t)
      }
    }
    knownTypes.value = [...seen].sort()
  }

  /**
   * Build the filter object from current filter state.
   *
   * @param page - Zero-based page index.
   * @param size - Number of items per page.
   * @returns Filter object for the API call.
   */
  function buildFilter(page: number, size: number): CredentialStatusFilter {
    const filter: CredentialStatusFilter = {
      offset: page * size,
      limit: Math.min(size, MAX_PAGE_SIZE),
    }
    if (filterUsername.value.trim()) {
      filter.username = filterUsername.value.trim()
    }
    if (filterStatus.value) {
      filter.status = filterStatus.value
    }
    const claimParts: string[] = []
    if (filterType.value) {
      claimParts.push(filterType.value)
    }
    if (filterClaims.value.trim()) {
      claimParts.push(
        ...filterClaims.value
          .split(',')
          .map((c) => c.trim())
          .filter((c) => c.length > 0),
      )
    }
    if (claimParts.length > 0) {
      filter.claims = claimParts
    }
    return filter
  }

  /**
   * Fetch a page of credential status entries from the admin API.
   *
   * @param realm - The Keycloak realm name.
   * @param page - Zero-based page index. Defaults to `currentPage`.
   * @param size - Number of items per page. Defaults to `pageSize`.
   */
  async function fetchCredentials(realm: string, page?: number, size?: number): Promise<void> {
    const requestedPage = page ?? currentPage.value
    const requestedSize = size ?? pageSize.value

    listLoading.value = true
    listError.value = null

    try {
      const response = await fetchCredentialStatuses(
        realm,
        buildFilter(requestedPage, requestedSize),
      )

      credentials.value = response.items
      totalCredentials.value = response.total
      pageSize.value = requestedSize
      currentPage.value = requestedPage
      updateKnownTypes()
    } catch (error) {
      listError.value =
        error instanceof CredentialApiError ? error.message : String(error)
      credentials.value = []
      totalCredentials.value = 0
    } finally {
      listLoading.value = false
    }
  }

  /**
   * Toggle the status of a credential entry between VALID and INVALID.
   *
   * After a successful update, the entry is updated in-place in the list.
   *
   * @param realm - The Keycloak realm name.
   * @param id - The internal mapping entry ID.
   * @param newStatus - The new status value.
   * @returns `true` on success, `false` on error.
   */
  async function toggleStatus(
    realm: string,
    id: string,
    newStatus: CredentialStatus,
  ): Promise<boolean> {
    updating.value = true
    updateError.value = null

    try {
      const updated = await updateCredentialStatus(realm, id, newStatus)
      const index = credentials.value.findIndex((c) => c.id === id)
      if (index !== -1) {
        credentials.value[index] = updated
      }
      return true
    } catch (error) {
      updateError.value =
        error instanceof CredentialApiError ? error.message : String(error)
      return false
    } finally {
      updating.value = false
    }
  }

  /**
   * Reset all filter fields and reload the list from page zero.
   *
   * @param realm - The Keycloak realm name.
   */
  async function resetFilters(realm: string): Promise<void> {
    filterUsername.value = ''
    filterStatus.value = ''
    filterType.value = ''
    filterClaims.value = ''
    await fetchCredentials(realm, 0)
  }

  /** Reset the store to its initial state. */
  function $reset(): void {
    credentials.value = []
    totalCredentials.value = 0
    pageSize.value = DEFAULT_PAGE_SIZE
    currentPage.value = 0
    listLoading.value = false
    listError.value = null
    filterUsername.value = ''
    filterStatus.value = ''
    filterType.value = ''
    filterClaims.value = ''
    knownTypes.value = []
    updating.value = false
    updateError.value = null
  }

  return {
    // State
    credentials,
    totalCredentials,
    pageSize,
    currentPage,
    listLoading,
    listError,
    filterUsername,
    filterStatus,
    filterType,
    filterClaims,
    knownTypes,
    updating,
    updateError,
    // Computed
    isEmpty,
    totalPages,
    // Actions
    fetchCredentials,
    toggleStatus,
    resetFilters,
    extractTypes,
    $reset,
  }
})
