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
 * Proxy middleware for routing API requests to downstream services.
 *
 * Each downstream service (TIL, TIR, CCS, ODRL) gets a dedicated proxy
 * that strips the `/api/<service>` prefix before forwarding. All request
 * headers — including `Authorization` — are forwarded transparently.
 */

import { type Express, type Response } from 'express'
import { createProxyMiddleware, type Options } from 'http-proxy-middleware'
import type { ClientRequest } from 'node:http'
import type { IncomingMessage } from 'node:http'
import { createAdminAuthGuard, createAuthenticatedGuard, AUTH_TOKEN_QUERY_PARAM } from './auth-guard.js'
import type { AppConfig } from './config.js'
import type { Logger } from './logger.js'

/** HTTP status code returned when a proxy request fails to reach the upstream. */
const BAD_GATEWAY_STATUS = 502

/** API path prefix for Trusted Issuers List routes. */
const TIL_API_PATH = '/api/til'

/** API path prefix for Trusted Issuers Registry routes. */
const TIR_API_PATH = '/api/tir'

/** API path prefix for Credentials Config Service routes. */
const CCS_API_PATH = '/api/ccs'

/** API path prefix for ODRL Policy routes. */
const ODRL_API_PATH = '/api/odrl'

/** Path prefix at which the Apisix Dashboard reverse proxy is mounted. */
const APISIX_DASHBOARD_PATH = '/apisix-dashboard'

/** Path prefix for the Apisix Admin API (called by the embedded dashboard UI). */
const APISIX_ADMIN_API_PATH = '/apisix'

/** HTTP header name used by the Apisix Admin API for authentication. */
const APISIX_API_KEY_HEADER = 'X-API-KEY'

/** API path prefix for Keycloak credential status admin routes. */
const CREDENTIALS_API_PATH = '/api/credentials'

/** API path prefix for Grafana proxy routes. */
const GRAFANA_API_PATH = '/api/grafana'

/** HTTP header injected into Grafana proxy requests for auth proxy mode. */
const GRAFANA_AUTH_PROXY_HEADER = 'X-WEBAUTH-USER'

/**
 * Query parameter carrying the JWT for iframe requests. Imported as
 * `AUTH_TOKEN_QUERY_PARAM` from `auth-guard.ts`; this alias keeps the
 * Grafana-specific proxy code readable.
 */
const GRAFANA_AUTH_TOKEN_PARAM = AUTH_TOKEN_QUERY_PARAM

/**
 * Cookie name used by the BFF to persist the Grafana username across
 * requests. Set on the response when the initial iframe request carries
 * a JWT, then read on subsequent requests so every proxied call to
 * Grafana includes the `X-WEBAUTH-USER` header.
 */
const GRAFANA_USER_COOKIE = '_grafana_user'

/** Prefix for the Bearer token in the Authorization header. */
const BEARER_PREFIX = 'Bearer '

/**
 * Extracts the path component from a URL string.
 *
 * @param urlString - A full URL (e.g. `http://host:9180/ui`)
 * @returns The path component (e.g. `/ui`), or `null` if absent or root-only
 */
function extractUrlPath(urlString: string): string | null {
  try {
    const parsed = new URL(urlString)
    const p = parsed.pathname.replace(/\/+$/, '')
    return p.length > 0 ? p : null
  } catch {
    return null
  }
}

/**
 * Returns the origin (scheme + host + port) of a URL, stripping any path.
 *
 * @param urlString - A full URL (e.g. `http://host:9180/ui`)
 * @returns The origin (e.g. `http://host:9180`)
 */
function extractUrlOrigin(urlString: string): string {
  try {
    const parsed = new URL(urlString)
    return parsed.origin
  } catch {
    return urlString
  }
}

/**
 * Extracts a username from a JWT Bearer token without verifying the signature.
 *
 * Decodes the JWT payload (base64url) and looks for `preferred_username`
 * first, then `sub` as a fallback. Returns `null` when the token is
 * missing, malformed, or does not contain a usable username claim.
 *
 * Signature verification is intentionally skipped because the BFF trusts
 * its own upstream — the token was already validated at the auth layer.
 *
 * @param authHeader - The raw `Authorization` header value (e.g. `Bearer eyJ…`)
 * @returns The extracted username, or `null` if extraction fails
 */
export function extractUsernameFromJwt(
  authHeader: string | undefined,
  logger?: Logger,
): string | null {
  if (!authHeader) {
    logger?.warn('[grafana-auth] No Authorization header present on request')
    return null
  }
  if (!authHeader.startsWith(BEARER_PREFIX)) {
    logger?.warn('[grafana-auth] Authorization header is not a Bearer token')
    return null
  }

  const token = authHeader.slice(BEARER_PREFIX.length)
  const parts = token.split('.')
  if (parts.length < 2) {
    logger?.warn('[grafana-auth] JWT has fewer than 2 parts — malformed token')
    return null
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'))
    const username = payload.preferred_username || payload.sub
    if (typeof username !== 'string' || username.length === 0) {
      logger?.warn(
        '[grafana-auth] JWT payload has no preferred_username or sub claim',
      )
      return null
    }
    return username
  } catch (err) {
    logger?.warn(
      `[grafana-auth] Failed to decode JWT payload: ${err instanceof Error ? err.message : String(err)}`,
    )
    return null
  }
}

/**
 * Read a named cookie value from a raw `Cookie` header string.
 *
 * @param cookieHeader - the raw `Cookie` header (e.g. `a=1; b=2`).
 * @param name - the cookie name to look up.
 * @returns the decoded cookie value, or `null` when not present.
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
 * Build a `Set-Cookie` header value for the Grafana user cookie.
 *
 * @param username - the username to persist.
 * @returns a cookie string with `HttpOnly`, `SameSite=Strict`, and a
 *   path scoped to the Grafana proxy.
 */
function buildGrafanaUserCookie(username: string): string {
  const encoded = encodeURIComponent(username)
  return `${GRAFANA_USER_COOKIE}=${encoded}; Path=${GRAFANA_API_PATH}; HttpOnly; SameSite=Strict`
}

/**
 * Descriptor for a single proxy route, mapping a local path prefix
 * to an upstream service URL.
 */
interface ProxyRoute {
  /** Local path prefix that triggers this proxy (e.g. `/api/til`). */
  path: string
  /** Full upstream URL to forward requests to. */
  target: string
  /** Optional headers injected into every proxied request. */
  headers?: Record<string, string>
}

/**
 * Creates proxy middleware options for a single downstream service.
 *
 * The middleware strips the local path prefix (e.g. `/api/til`) before
 * forwarding to the target, so `/api/til/v4/issuers` becomes `/v4/issuers`
 * at the upstream.
 *
 * Includes error, request, and response logging so that proxy failures
 * are visible in server logs rather than silently swallowed.
 *
 * @param route - The proxy route descriptor
 * @param logger - Logger instance for emitting proxy diagnostics
 * @returns http-proxy-middleware options
 */
function createProxyOptions(route: ProxyRoute, logger: Logger): Options {
  return {
    target: route.target,
    changeOrigin: true,
    pathRewrite: {
      [`^${route.path}`]: '',
    },
    on: {
      proxyReq: (proxyReq: ClientRequest, req) => {
        if (route.headers) {
          for (const [name, value] of Object.entries(route.headers)) {
            proxyReq.setHeader(name, value)
          }
        }
        logger.debug(`[proxy] ${req.method} ${req.url} -> ${route.target}`)
      },
      proxyRes: (proxyRes, req) => {
        logger.debug(
          `[proxy] ${req.method} ${req.url} <- ${route.target} ${proxyRes.statusCode}`,
        )
      },
      error: (err: Error, req: IncomingMessage, res: unknown) => {
        logger.error(
          `[proxy] ${req.method} ${req.url} -> ${route.target} failed: ${err.message}`,
        )
        if (res && typeof res === 'object' && 'writeHead' in res) {
          const httpRes = res as Response
          if (!httpRes.headersSent) {
            httpRes.writeHead(BAD_GATEWAY_STATUS, { 'Content-Type': 'application/json' })
          }
          httpRes.end(
            JSON.stringify({
              error: 'Bad Gateway',
              message: `Upstream ${route.target} is unreachable: ${err.message}`,
            }),
          )
        }
      },
    },
  }
}

/**
 * Mounts proxy middleware for configured downstream services on the Express app.
 *
 * Only services whose upstream URL is non-empty are mounted. Possible routes:
 * - `/api/til/*` → `config.tilApiUrl`
 * - `/api/tir/*` → `config.tirApiUrl`
 * - `/api/ccs/*` → `config.ccsApiUrl`
 * - `/api/odrl/*` → `config.odrlApiUrl`
 * - `/apisix-dashboard/*` → `config.apisixDashboardUrl`
 * - The upstream's base path (e.g. `/ui/*`) is also proxied so that
 *   absolute asset references in the Apisix Dashboard HTML resolve
 *   correctly through the reverse proxy.
 *
 * Each proxy strips its path prefix before forwarding and passes all
 * request headers through unchanged.
 *
 * @param app - The Express application to mount proxy routes on
 * @param config - Application configuration with upstream service URLs
 * @param logger - Logger instance for proxy diagnostics
 */
export function mountProxyMiddleware(app: Express, config: AppConfig, logger: Logger): void {
  const apiRoutes: ProxyRoute[] = [
    { path: TIL_API_PATH, target: config.tilApiUrl },
    { path: TIR_API_PATH, target: config.tirApiUrl },
    { path: CCS_API_PATH, target: config.ccsApiUrl },
    { path: ODRL_API_PATH, target: config.odrlApiUrl },
  ].filter((route) => route.target !== '')

  for (const route of apiRoutes) {
    app.use(route.path, createProxyMiddleware(createProxyOptions(route, logger)))
  }

  if (config.apisixDashboardUrl !== '') {
    const adminGuard = createAdminAuthGuard(config, logger)

    const apisixRoutes: ProxyRoute[] = [
      { path: APISIX_DASHBOARD_PATH, target: config.apisixDashboardUrl },
    ]

    const upstreamPath = extractUrlPath(config.apisixDashboardUrl)
    if (upstreamPath !== null) {
      apisixRoutes.push({
        path: upstreamPath,
        target: config.apisixDashboardUrl,
      })
    }

    const adminHeaders: Record<string, string> = {}
    if (config.apisixAdminApiKey !== '') {
      adminHeaders[APISIX_API_KEY_HEADER] = config.apisixAdminApiKey
    }
    apisixRoutes.push({
      path: APISIX_ADMIN_API_PATH,
      target: extractUrlOrigin(config.apisixDashboardUrl) + APISIX_ADMIN_API_PATH,
      headers: adminHeaders,
    })

    for (const route of apisixRoutes) {
      const opts = createProxyOptions(route, logger)
      const origProxyReq = opts.on?.proxyReq
      opts.on = {
        ...opts.on,
        proxyReq: (proxyReq: ClientRequest, req, res, options) => {
          if (typeof origProxyReq === 'function') {
            origProxyReq(proxyReq, req, res, options)
          }
          const qIndex = proxyReq.path.indexOf('?')
          if (qIndex !== -1) {
            const params = new URLSearchParams(proxyReq.path.substring(qIndex))
            if (params.has(AUTH_TOKEN_QUERY_PARAM)) {
              params.delete(AUTH_TOKEN_QUERY_PARAM)
              const remaining = params.toString()
              proxyReq.path =
                proxyReq.path.substring(0, qIndex) + (remaining ? '?' + remaining : '')
            }
          }
        },
      }
      app.use(route.path, adminGuard, createProxyMiddleware(opts))
    }
  }

  if (config.grafanaUrl !== '') {
    const grafanaOptions = createProxyOptions(
      { path: GRAFANA_API_PATH, target: config.grafanaUrl },
      logger,
    )
    const originalOnProxyReq = grafanaOptions.on?.proxyReq
    grafanaOptions.on = {
      ...grafanaOptions.on,
      proxyReq: (proxyReq: ClientRequest, req, res, options) => {
        if (typeof originalOnProxyReq === 'function') {
          originalOnProxyReq(proxyReq, req, res, options)
        }
        const incomingReq = req as IncomingMessage
        let username: string | null = null

        // 1. Try the Authorization header (normal API calls)
        const authHeader = incomingReq.headers?.authorization
        if (authHeader) {
          username = extractUsernameFromJwt(authHeader, logger)
        }

        // 2. Try the _auth_token query param (initial iframe load).
        //    Strip it from the forwarded URL so the token never reaches Grafana.
        if (!username && incomingReq.url) {
          const qIndex = incomingReq.url.indexOf('?')
          if (qIndex !== -1) {
            const params = new URLSearchParams(incomingReq.url.substring(qIndex))
            const queryToken = params.get(GRAFANA_AUTH_TOKEN_PARAM)
            if (queryToken) {
              username = extractUsernameFromJwt(BEARER_PREFIX + queryToken, logger)
              params.delete(GRAFANA_AUTH_TOKEN_PARAM)
              const remaining = params.toString()
              proxyReq.path =
                incomingReq.url.substring(0, qIndex) + (remaining ? '?' + remaining : '')
              if (username) {
                logger.info(`[grafana-auth] Extracted user "${username}" from query token`)
              }
            }
          }
        }

        // 3. Fall back to the BFF session cookie set on a prior request.
        if (!username) {
          const cookieUser = readCookie(incomingReq.headers?.cookie, GRAFANA_USER_COOKIE)
          if (cookieUser) {
            username = cookieUser
            logger.debug(`[grafana-auth] Restored user "${username}" from session cookie`)
          }
        }

        if (username) {
          proxyReq.setHeader(GRAFANA_AUTH_PROXY_HEADER, username)
          // Store the username on the request so proxyRes can set the cookie.
          ;(incomingReq as IncomingMessage & { _grafanaUser?: string })._grafanaUser = username
        } else {
          logger.warn(
            '[grafana-auth] Proxying request to Grafana without X-WEBAUTH-USER header',
          )
        }

        // Grafana is configured with serve_from_sub_path=true, so the
        // /api/grafana prefix must be preserved in the forwarded request.
        proxyReq.path = GRAFANA_API_PATH + proxyReq.path
      },
      proxyRes: (proxyRes, req) => {
        // When we authenticated via token (not cookie), persist the
        // username as a BFF cookie so subsequent requests are covered.
        const storedUser = (req as IncomingMessage & { _grafanaUser?: string })._grafanaUser
        const hadCookie = !!readCookie(
          (req as IncomingMessage).headers?.cookie,
          GRAFANA_USER_COOKIE,
        )
        if (storedUser && !hadCookie) {
          const existing = proxyRes.headers['set-cookie'] ?? []
          const cookies = Array.isArray(existing) ? existing : [existing]
          cookies.push(buildGrafanaUserCookie(storedUser))
          proxyRes.headers['set-cookie'] = cookies
          logger.info(`[grafana-auth] Set session cookie for user "${storedUser}"`)
        }
      },
    }
    const grafanaAuthGuard = createAuthenticatedGuard(config, logger)
    app.use(GRAFANA_API_PATH, grafanaAuthGuard, createProxyMiddleware(grafanaOptions))
  }

  if (config.keycloakUrl !== '') {
    const credentialsRoute: ProxyRoute = {
      path: CREDENTIALS_API_PATH,
      target: config.keycloakUrl,
    }
    const credentialsAuthGuard = createAuthenticatedGuard(config, logger)
    app.use(
      credentialsRoute.path,
      credentialsAuthGuard,
      createProxyMiddleware(createProxyOptions(credentialsRoute, logger)),
    )
  }
}
