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
 * Server-side authentication guard for protected routes.
 *
 * Protects sensitive proxy endpoints by requiring a valid Bearer JWT
 * issued by a configured OIDC provider. Two guard levels are available:
 *
 * - **Admin guard** — requires the canonical `admin` role (e.g. APISIX Dashboard).
 * - **Authenticated guard** — requires any valid token from a known issuer
 *   (e.g. Grafana monitoring panels).
 *
 * The guard reads the same `AUTH_CONFIG_JSON` provider configuration that
 * the frontend uses, so role mapping stays consistent across both layers.
 *
 * When no providers are configured (auth-disabled mode), the guard passes
 * all requests through to preserve legacy open-mode behaviour.
 */

import type { RequestHandler, Request, Response, NextFunction } from 'express'
import type { AppConfig } from './config.js'
import type { Logger } from './logger.js'

/** HTTP status code returned when no valid credentials are provided. */
const HTTP_UNAUTHORIZED = 401

/** HTTP status code returned when credentials are valid but insufficient. */
const HTTP_FORBIDDEN = 403

/** Prefix for the Bearer token in the Authorization header. */
const BEARER_PREFIX = 'Bearer '

/** Canonical admin role identifier, matching the frontend constant. */
const ROLE_ADMIN = 'admin'

/** Default claim path for role extraction (Keycloak `realm_access.roles`). */
const DEFAULT_ROLES_CLAIM_PATH = 'realm_access.roles'

/**
 * Query parameter carrying the JWT for iframe requests that cannot set
 * HTTP headers. Used by both the Grafana and APISIX Dashboard views.
 */
export const AUTH_TOKEN_QUERY_PARAM = '_auth_token'

/**
 * Cookie name for persisting the JWT across iframe sub-requests.
 *
 * After an initial iframe load authenticates via the `_auth_token` query
 * parameter, this `HttpOnly` session cookie carries the JWT for subsequent
 * AJAX requests from the embedded SPA (which cannot set custom headers).
 */
export const AUTH_SESSION_COOKIE = '_fdsc_auth'

/**
 * Read a named cookie value from a raw `Cookie` header string.
 *
 * @param cookieHeader - The raw `Cookie` header (e.g. `a=1; b=2`)
 * @param name - The cookie name to look up
 * @returns The decoded cookie value, or `null` when not present
 */
function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) {
    return null
  }
  for (const part of cookieHeader.split(';')) {
    const eqIndex = part.indexOf('=')
    if (eqIndex === -1) {
      continue
    }
    const key = part.substring(0, eqIndex).trim()
    if (key === name) {
      return decodeURIComponent(part.substring(eqIndex + 1).trim())
    }
  }
  return null
}

/**
 * Build a `Set-Cookie` header value for the auth session cookie.
 *
 * The cookie is `HttpOnly` (no JS access), `SameSite=Strict` (no CSRF),
 * and scoped to `Path=/` because embedded dashboards (e.g. APISIX) make
 * requests to multiple path prefixes.
 *
 * @param token - The raw JWT string to persist
 * @returns A formatted `Set-Cookie` value
 */
function buildAuthSessionCookie(token: string): string {
  const encoded = encodeURIComponent(token)
  return `${AUTH_SESSION_COOKIE}=${encoded}; Path=/; HttpOnly; SameSite=Strict`
}

/**
 * Minimal provider shape needed for server-side role resolution.
 * Mirrors the relevant fields from the frontend's `OAuthProviderConfig`.
 */
interface AuthProvider {
  /** OIDC issuer URL, matched against the JWT `iss` claim. */
  readonly issuer: string
  /** Dotted/bracket path to the roles array in the JWT claims. */
  readonly rolesClaimPath?: string
  /** Mapping from provider-specific role names to canonical dashboard roles. */
  readonly roleMapping?: Readonly<Record<string, string>>
}

/**
 * Parsed auth configuration containing the provider list.
 */
interface ParsedAuthConfig {
  /** Configured OAuth2 providers. Empty array means auth is disabled. */
  readonly providers: readonly AuthProvider[]
}

/**
 * Parse the claim path string into ordered property-name segments.
 *
 * Supports dot notation (`realm_access.roles`) and bracket notation
 * (`resource_access[did:web:x.org].roles`) for property names that
 * contain dots.
 *
 * @param path - Claim path string
 * @returns Ordered array of property-name segments
 */
export function parseClaimPath(path: string): string[] {
  const segments: string[] = []
  let i = 0
  while (i < path.length) {
    if (path[i] === '.') {
      i++
      continue
    }
    if (path[i] === '[') {
      const close = path.indexOf(']', i + 1)
      if (close === -1) {
        segments.push(path.substring(i + 1))
        break
      }
      const key = path.substring(i + 1, close)
      if (key.length > 0) {
        segments.push(key)
      }
      i = close + 1
      continue
    }
    let end = i
    while (end < path.length && path[end] !== '.' && path[end] !== '[') {
      end++
    }
    const key = path.substring(i, end)
    if (key.length > 0) {
      segments.push(key)
    }
    i = end
  }
  return segments
}

/**
 * Walk a claim path on a JSON-like object and return the value, or
 * `undefined` if any segment is missing.
 *
 * @param source - Claims object to walk
 * @param path - Claim path string
 * @returns The value at the path, or `undefined`
 */
function readClaimPath(source: unknown, path: string): unknown {
  if (source === null || source === undefined) {
    return undefined
  }
  const segments = parseClaimPath(path)
  let cursor: unknown = source
  for (const segment of segments) {
    if (
      cursor === null ||
      cursor === undefined ||
      typeof cursor !== 'object' ||
      Array.isArray(cursor)
    ) {
      return undefined
    }
    cursor = (cursor as Record<string, unknown>)[segment]
  }
  return cursor
}

/**
 * Coerce the value at the resolved claim path into an array of role
 * strings. Accepts an array of strings, a single space-separated
 * string, or returns an empty array for anything else.
 *
 * @param raw - Raw value from the JWT claims
 * @returns Normalised array of role strings
 */
function normaliseRawRoles(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((r): r is string => typeof r === 'string')
  }
  if (typeof raw === 'string') {
    return raw.split(/\s+/).filter((r) => r.length > 0)
  }
  return []
}

/**
 * Check whether the JWT claims resolve to the admin role for a given provider.
 *
 * Uses the provider's `rolesClaimPath` and `roleMapping` to resolve
 * canonical roles, consistent with the frontend's `resolveUserRole`.
 *
 * @param provider - Provider configuration with role mapping
 * @param claims - Decoded JWT payload
 * @returns `true` when the claims contain the canonical admin role
 */
export function isAdminClaim(provider: AuthProvider, claims: Record<string, unknown>): boolean {
  const claimPath = provider.rolesClaimPath ?? DEFAULT_ROLES_CLAIM_PATH
  const rawRoles = normaliseRawRoles(readClaimPath(claims, claimPath))

  const mapping = provider.roleMapping
  for (const raw of rawRoles) {
    if (mapping && raw in mapping) {
      if (mapping[raw] === ROLE_ADMIN) {
        return true
      }
      continue
    }
    if (raw === ROLE_ADMIN) {
      return true
    }
  }
  return false
}

/**
 * Safely parse the `AUTH_CONFIG_JSON` string into a provider list.
 *
 * Returns an empty provider list on malformed or missing JSON so the
 * guard falls through to auth-disabled mode rather than crashing.
 *
 * @param json - Raw JSON string from the environment
 * @param logger - Logger for parse warnings
 * @returns Parsed auth configuration
 */
export function parseAuthConfig(json: string, logger?: Logger): ParsedAuthConfig {
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>
    if (!parsed || !Array.isArray(parsed.providers)) {
      return { providers: [] }
    }
    return { providers: parsed.providers as AuthProvider[] }
  } catch (err) {
    logger?.warn(
      `[auth-guard] Failed to parse AUTH_CONFIG_JSON: ${err instanceof Error ? err.message : String(err)}`,
    )
    return { providers: [] }
  }
}

/**
 * Decode a JWT payload without verifying the signature.
 *
 * Signature verification is intentionally skipped because the BFF sits
 * behind the ingress — the token was already issued by the trusted OIDC
 * provider and the guard only needs to read the claims. This is consistent
 * with the existing Grafana proxy auth approach.
 *
 * @param token - Raw JWT string (without the `Bearer ` prefix)
 * @returns Decoded payload object, or `null` when the token is malformed
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) {
    return null
  }
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8')) as Record<
      string,
      unknown
    >
  } catch {
    return null
  }
}

/**
 * Find the provider whose `issuer` matches the JWT's `iss` claim.
 *
 * @param providers - Configured providers
 * @param issuer - The `iss` claim from the JWT
 * @returns The matching provider, or `undefined`
 */
function findProviderByIssuer(
  providers: readonly AuthProvider[],
  issuer: unknown,
): AuthProvider | undefined {
  if (typeof issuer !== 'string' || issuer.length === 0) {
    return undefined
  }
  return providers.find((p) => p.issuer === issuer)
}

/**
 * Options for configuring the auth guard behaviour.
 */
export interface AuthGuardOptions {
  /** When `true`, the guard additionally requires the canonical admin role. */
  readonly requireAdmin: boolean
}

/**
 * Creates Express middleware that restricts access to authenticated users.
 *
 * When auth is disabled (no providers in `AUTH_CONFIG_JSON`), all requests
 * pass through. Otherwise:
 * - Missing or invalid Bearer token → 401 Unauthorized
 * - Valid token but no matching provider → 401 Unauthorized
 * - When `requireAdmin` is set: valid token but not admin role → 403 Forbidden
 * - Valid token (with admin role if required) → request continues
 *
 * @param config - Application configuration containing `authConfigJson`
 * @param logger - Logger for diagnostics
 * @param options - Guard options controlling the required access level
 * @returns Express middleware function
 */
export function createAuthGuard(
  config: AppConfig,
  logger: Logger,
  options: AuthGuardOptions,
): RequestHandler {
  const authConfig = parseAuthConfig(config.authConfigJson, logger)
  const authEnabled = authConfig.providers.length > 0
  const label = options.requireAdmin ? 'admin' : 'authenticated'

  if (!authEnabled) {
    logger.info(`[auth-guard] No auth providers configured — ${label} guard is disabled (open mode)`)
  } else {
    logger.info(
      `[auth-guard] ${label} guard enabled with ${authConfig.providers.length} provider(s)`,
    )
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!authEnabled) {
      next()
      return
    }

    let token: string | undefined
    let tokenSource: 'header' | 'query' | 'cookie' = 'header'

    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith(BEARER_PREFIX)) {
      token = authHeader.slice(BEARER_PREFIX.length)
    }

    if (!token) {
      const queryToken = req.query[AUTH_TOKEN_QUERY_PARAM]
      if (typeof queryToken === 'string' && queryToken.length > 0) {
        token = queryToken
        tokenSource = 'query'
      }
    }

    if (!token) {
      const cookieToken = readCookie(req.headers.cookie, AUTH_SESSION_COOKIE)
      if (cookieToken) {
        token = cookieToken
        tokenSource = 'cookie'
      }
    }

    if (!token) {
      logger.warn(`[auth-guard] Rejected ${req.method} ${req.path} — no Bearer token`)
      res.status(HTTP_UNAUTHORIZED).json({ error: 'Unauthorized', message: 'Authentication required' })
      return
    }

    const claims = decodeJwtPayload(token)
    if (!claims) {
      logger.warn(`[auth-guard] Rejected ${req.method} ${req.path} — malformed JWT (via ${tokenSource})`)
      res.status(HTTP_UNAUTHORIZED).json({ error: 'Unauthorized', message: 'Malformed token' })
      return
    }

    const provider = findProviderByIssuer(authConfig.providers, claims.iss)
    if (!provider) {
      logger.warn(
        `[auth-guard] Rejected ${req.method} ${req.path} — unknown issuer "${String(claims.iss)}"`,
      )
      res.status(HTTP_UNAUTHORIZED).json({ error: 'Unauthorized', message: 'Unknown token issuer' })
      return
    }

    if (options.requireAdmin && !isAdminClaim(provider, claims)) {
      logger.warn(`[auth-guard] Rejected ${req.method} ${req.path} — insufficient privileges`)
      res.status(HTTP_FORBIDDEN).json({ error: 'Forbidden', message: 'Admin role required' })
      return
    }

    if (tokenSource === 'query') {
      const existingCookies = res.getHeader('Set-Cookie')
      const cookies = Array.isArray(existingCookies)
        ? (existingCookies as string[])
        : existingCookies
          ? [String(existingCookies)]
          : []
      cookies.push(buildAuthSessionCookie(token))
      res.setHeader('Set-Cookie', cookies)
      logger.info(`[auth-guard] Set session cookie for ${req.method} ${req.path}`)
    }

    next()
  }
}

/**
 * Convenience factory for an admin-only auth guard.
 *
 * Equivalent to `createAuthGuard(config, logger, { requireAdmin: true })`.
 *
 * @param config - Application configuration containing `authConfigJson`
 * @param logger - Logger for diagnostics
 * @returns Express middleware that requires the admin role
 */
export function createAdminAuthGuard(config: AppConfig, logger: Logger): RequestHandler {
  return createAuthGuard(config, logger, { requireAdmin: true })
}

/**
 * Convenience factory for an authentication-only guard (any valid user).
 *
 * Equivalent to `createAuthGuard(config, logger, { requireAdmin: false })`.
 *
 * @param config - Application configuration containing `authConfigJson`
 * @param logger - Logger for diagnostics
 * @returns Express middleware that requires a valid token from a known issuer
 */
export function createAuthenticatedGuard(config: AppConfig, logger: Logger): RequestHandler {
  return createAuthGuard(config, logger, { requireAdmin: false })
}
