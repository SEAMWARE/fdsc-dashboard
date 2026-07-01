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
 * API client for the Keycloak Token Status List admin endpoints.
 *
 * Calls are routed through the BFF proxy at `/api/credentials` which
 * forwards to the configured Keycloak instance. The realm is included
 * in the request path so the BFF can proxy to the correct realm.
 */

import { getAuthTokenSync } from '@/composables/useAuth'

/** BFF proxy base path for credential status admin requests. */
const CREDENTIALS_PROXY_BASE = '/api/credentials'

/** HTTP status code indicating a client error (bad request). */
const HTTP_BAD_REQUEST = 400

/** MIME type for JSON request bodies. */
const CONTENT_TYPE_JSON = 'application/json'

/** Valid credential status values. */
export type CredentialStatus = 'VALID' | 'INVALID'

/**
 * A single credential status entry returned by the admin API.
 */
export interface CredentialStatusEntry {
  /** Internal mapping entry ID. */
  id: string
  /** Token identifier of the issued credential. */
  token_id: string
  /** Keycloak user ID of the credential holder. */
  user_id: string
  /** Username of the credential holder. */
  username: string | null
  /** Current token status. */
  status: CredentialStatus
  /** Identifier of the status list this credential belongs to. */
  status_list_id: string
  /** Index position within the status list. */
  index: number
  /** Creation time as Unix epoch milliseconds. */
  created_timestamp: number
  /** Arbitrary metadata extracted from credential claims at issuance time. */
  metadata: Record<string, unknown> | null
}

/**
 * Paginated response from the credential status list endpoint.
 */
export interface CredentialStatusPage {
  /** Credential status entries for the current page. */
  items: CredentialStatusEntry[]
  /** Total number of credential status entries in the realm. */
  total: number
  /** Zero-based offset used for this page. */
  offset: number
  /** Maximum number of entries per page. */
  limit: number
}

/**
 * Filter parameters for listing credential status entries.
 */
export interface CredentialStatusFilter {
  /** Zero-based pagination offset. */
  offset?: number
  /** Maximum number of entries to return (capped at 100). */
  limit?: number
  /** Filter by exact username. */
  username?: string
  /** Filter by token status. */
  status?: CredentialStatus
  /** Filter by metadata content (substring match, AND logic). */
  claims?: string[]
}

/**
 * Error thrown when a credential status API call fails.
 */
export class CredentialApiError extends Error {
  /** HTTP status code of the failed response. */
  readonly statusCode: number

  /**
   * @param message - Human-readable error message.
   * @param statusCode - HTTP status code of the failed response.
   */
  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'CredentialApiError'
    this.statusCode = statusCode
  }
}

/**
 * Build the base URL for a realm's status-list-admin endpoint.
 *
 * @param realm - The Keycloak realm name.
 * @returns The full BFF proxy path to the status-list-admin endpoint.
 */
function adminUrl(realm: string): string {
  return `${CREDENTIALS_PROXY_BASE}/realms/${encodeURIComponent(realm)}/status-list-admin`
}

/**
 * Build standard request headers with Bearer token authorization.
 *
 * @returns Headers object with Content-Type and Authorization.
 */
function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': CONTENT_TYPE_JSON,
  }
  const token = getAuthTokenSync()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

/**
 * Fetch a paginated list of credential status entries from the admin API.
 *
 * @param realm - The Keycloak realm name.
 * @param filter - Optional filter parameters for pagination and search.
 * @returns A paginated list of credential status entries.
 * @throws {CredentialApiError} When the API returns an error response.
 */
export async function fetchCredentialStatuses(
  realm: string,
  filter?: CredentialStatusFilter,
): Promise<CredentialStatusPage> {
  const params = new URLSearchParams()

  if (filter?.offset !== undefined) {
    params.set('offset', String(filter.offset))
  }
  if (filter?.limit !== undefined) {
    params.set('limit', String(filter.limit))
  }
  if (filter?.username) {
    params.set('username', filter.username)
  }
  if (filter?.status) {
    params.set('status', filter.status)
  }
  if (filter?.claims) {
    for (const claim of filter.claims) {
      params.append('claims', claim)
    }
  }

  const queryString = params.toString()
  const url = adminUrl(realm) + (queryString ? `?${queryString}` : '')

  const response = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(),
  })

  if (response.status >= HTTP_BAD_REQUEST) {
    let message: string
    try {
      const body = (await response.json()) as Record<string, unknown>
      message = typeof body.error === 'string' ? body.error : response.statusText
    } catch {
      message = response.statusText
    }
    throw new CredentialApiError(message, response.status)
  }

  return (await response.json()) as CredentialStatusPage
}

/**
 * Update the status of a credential entry.
 *
 * @param realm - The Keycloak realm name.
 * @param id - The internal mapping entry ID.
 * @param status - The new status value (`VALID` or `INVALID`).
 * @returns The updated credential status entry.
 * @throws {CredentialApiError} When the API returns an error response.
 */
export async function updateCredentialStatus(
  realm: string,
  id: string,
  status: CredentialStatus,
): Promise<CredentialStatusEntry> {
  const url = `${adminUrl(realm)}/${encodeURIComponent(id)}`

  const response = await fetch(url, {
    method: 'PUT',
    headers: buildHeaders(),
    body: JSON.stringify({ status }),
  })

  if (response.status >= HTTP_BAD_REQUEST) {
    let message: string
    try {
      const body = (await response.json()) as Record<string, unknown>
      message = typeof body.error === 'string' ? body.error : response.statusText
    } catch {
      message = response.statusText
    }
    throw new CredentialApiError(message, response.status)
  }

  return (await response.json()) as CredentialStatusEntry
}
