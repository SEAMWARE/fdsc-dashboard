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
 * Tests for the server-side admin authentication guard.
 *
 * Verifies that the guard correctly blocks unauthenticated and
 * non-admin requests to protected routes while allowing admin users
 * and passing everything through when auth is disabled.
 */

import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import {
  createAdminAuthGuard,
  decodeJwtPayload,
  isAdminClaim,
  parseAuthConfig,
  parseClaimPath,
} from '../auth-guard.js'
import type { AppConfig } from '../config.js'
import type { Logger } from '../logger.js'

/** HTTP status code for Unauthorized responses. */
const HTTP_UNAUTHORIZED = 401

/** HTTP status code for Forbidden responses. */
const HTTP_FORBIDDEN = 403

/** HTTP status code for successful responses. */
const HTTP_OK = 200

/** Test issuer URL used across test fixtures. */
const TEST_ISSUER = 'https://accounts.example.com/realms/test'

/**
 * Builds a fake JWT with the given payload (no signature verification needed).
 *
 * @param payload - Claims to encode in the JWT payload
 * @returns A three-part JWT string with a fake header and signature
 */
function buildFakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.fakesignature`
}

/**
 * Creates a mock Logger where every method is a vitest spy.
 *
 * @returns A Logger with all methods replaced by vi.fn()
 */
function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

/**
 * Creates a test AppConfig with optional overrides.
 *
 * @param overrides - Partial config values to override defaults
 * @returns A complete AppConfig suitable for testing
 */
function createTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 3000,
    tilApiUrl: '',
    tirApiUrl: '',
    ccsApiUrl: '',
    odrlApiUrl: '',
    apisixDashboardUrl: '',
    apisixAdminApiKey: '',
    authConfigJson: '{"providers":[]}',
    staticDir: '../dist',
    logLevel: 'debug',
    grafanaUrl: '',
    grafanaIframeUrl: '',
    grafanaPanelsJson: '[]',
    ...overrides,
  }
}

/**
 * Creates an Express app with the admin auth guard on a test endpoint.
 *
 * @param config - Application configuration
 * @returns Express app with GET /protected → guard → 200 OK
 */
function createGuardedApp(config: AppConfig): express.Express {
  const app = express()
  const guard = createAdminAuthGuard(config, createMockLogger())
  app.get('/protected', guard, (_req, res) => {
    res.status(HTTP_OK).json({ message: 'ok' })
  })
  return app
}

/** Auth config JSON with a single Keycloak-style provider using custom role mapping. */
const AUTH_CONFIG_WITH_PROVIDER = JSON.stringify({
  providers: [
    {
      id: 'keycloak',
      displayName: 'Keycloak',
      issuer: TEST_ISSUER,
      clientId: 'dashboard',
      rolesClaimPath: 'client_roles',
      roleMapping: {
        'fdsc-admin': 'admin',
        'fdsc-viewer': 'viewer',
      },
    },
  ],
})

/** Auth config JSON with a provider using default realm_access.roles claim path. */
const AUTH_CONFIG_DEFAULT_CLAIM_PATH = JSON.stringify({
  providers: [
    {
      id: 'keycloak',
      displayName: 'Keycloak',
      issuer: TEST_ISSUER,
      clientId: 'dashboard',
    },
  ],
})

describe('parseClaimPath', () => {
  it.each([
    { input: 'realm_access.roles', expected: ['realm_access', 'roles'] },
    { input: 'client_roles', expected: ['client_roles'] },
    { input: 'resource_access[did:web:x.org].roles', expected: ['resource_access', 'did:web:x.org', 'roles'] },
    { input: 'a.b.c', expected: ['a', 'b', 'c'] },
    { input: '', expected: [] },
  ])('parses "$input" into $expected', ({ input, expected }) => {
    expect(parseClaimPath(input)).toEqual(expected)
  })
})

describe('decodeJwtPayload', () => {
  it('decodes a valid JWT payload', () => {
    const payload = { sub: 'user-1', iss: TEST_ISSUER }
    const jwt = buildFakeJwt(payload)
    expect(decodeJwtPayload(jwt)).toEqual(payload)
  })

  it('returns null for a token with fewer than 2 parts', () => {
    expect(decodeJwtPayload('single-segment')).toBeNull()
  })

  it('returns null for invalid base64 in the payload', () => {
    expect(decodeJwtPayload('header.!!!invalid!!!.sig')).toBeNull()
  })
})

describe('isAdminClaim', () => {
  const providerWithMapping = {
    issuer: TEST_ISSUER,
    rolesClaimPath: 'client_roles',
    roleMapping: { 'fdsc-admin': 'admin', 'fdsc-viewer': 'viewer' } as Record<string, string>,
  }

  const providerWithDefaultPath = {
    issuer: TEST_ISSUER,
  }

  it('returns true when a mapped role resolves to admin', () => {
    expect(isAdminClaim(providerWithMapping, { client_roles: ['fdsc-admin'] })).toBe(true)
  })

  it('returns false when mapped roles resolve only to viewer', () => {
    expect(isAdminClaim(providerWithMapping, { client_roles: ['fdsc-viewer'] })).toBe(false)
  })

  it('returns false when no roles are present', () => {
    expect(isAdminClaim(providerWithMapping, {})).toBe(false)
  })

  it('returns false when roles claim is at the wrong path', () => {
    expect(isAdminClaim(providerWithMapping, { realm_access: { roles: ['admin'] } })).toBe(false)
  })

  it('returns true for literal "admin" without mapping', () => {
    expect(isAdminClaim(providerWithDefaultPath, { realm_access: { roles: ['admin'] } })).toBe(
      true,
    )
  })

  it('returns false for literal "viewer" without mapping', () => {
    expect(isAdminClaim(providerWithDefaultPath, { realm_access: { roles: ['viewer'] } })).toBe(
      false,
    )
  })

  it('returns true when admin is among multiple roles', () => {
    expect(
      isAdminClaim(providerWithMapping, { client_roles: ['fdsc-viewer', 'fdsc-admin'] }),
    ).toBe(true)
  })

  it('handles space-separated role string', () => {
    expect(isAdminClaim(providerWithMapping, { client_roles: 'fdsc-admin fdsc-viewer' })).toBe(
      true,
    )
  })
})

describe('parseAuthConfig', () => {
  it('parses valid auth config JSON', () => {
    const config = parseAuthConfig(AUTH_CONFIG_WITH_PROVIDER)
    expect(config.providers).toHaveLength(1)
    expect(config.providers[0].issuer).toBe(TEST_ISSUER)
  })

  it('returns empty providers for empty JSON', () => {
    expect(parseAuthConfig('{"providers":[]}')).toEqual({ providers: [] })
  })

  it('returns empty providers for malformed JSON', () => {
    const logger = createMockLogger()
    expect(parseAuthConfig('not json', logger)).toEqual({ providers: [] })
    expect(logger.warn).toHaveBeenCalled()
  })

  it('returns empty providers when providers field is missing', () => {
    expect(parseAuthConfig('{}')).toEqual({ providers: [] })
  })
})

describe('createAdminAuthGuard — auth disabled (no providers)', () => {
  it('passes requests through when no providers are configured', async () => {
    const app = createGuardedApp(createTestConfig())

    const response = await request(app).get('/protected')
    expect(response.status).toBe(HTTP_OK)
  })
})

describe('createAdminAuthGuard — auth enabled', () => {
  const configWithAuth = createTestConfig({ authConfigJson: AUTH_CONFIG_WITH_PROVIDER })

  it('rejects requests with no Authorization header', async () => {
    const app = createGuardedApp(configWithAuth)

    const response = await request(app).get('/protected')
    expect(response.status).toBe(HTTP_UNAUTHORIZED)
    expect(response.body.error).toBe('Unauthorized')
  })

  it('rejects requests with non-Bearer Authorization', async () => {
    const app = createGuardedApp(configWithAuth)

    const response = await request(app).get('/protected').set('Authorization', 'Basic abc123')
    expect(response.status).toBe(HTTP_UNAUTHORIZED)
  })

  it('rejects requests with a malformed JWT', async () => {
    const app = createGuardedApp(configWithAuth)

    const response = await request(app).get('/protected').set('Authorization', 'Bearer not-a-jwt')
    expect(response.status).toBe(HTTP_UNAUTHORIZED)
    expect(response.body.message).toBe('Malformed token')
  })

  it('rejects requests with an unknown issuer', async () => {
    const app = createGuardedApp(configWithAuth)
    const jwt = buildFakeJwt({
      iss: 'https://unknown-issuer.example.com',
      client_roles: ['fdsc-admin'],
    })

    const response = await request(app).get('/protected').set('Authorization', `Bearer ${jwt}`)
    expect(response.status).toBe(HTTP_UNAUTHORIZED)
    expect(response.body.message).toBe('Unknown token issuer')
  })

  it('rejects requests with a valid token but no admin role', async () => {
    const app = createGuardedApp(configWithAuth)
    const jwt = buildFakeJwt({
      iss: TEST_ISSUER,
      sub: 'viewer-user',
      client_roles: ['fdsc-viewer'],
    })

    const response = await request(app).get('/protected').set('Authorization', `Bearer ${jwt}`)
    expect(response.status).toBe(HTTP_FORBIDDEN)
    expect(response.body.message).toBe('Admin role required')
  })

  it('rejects requests with a valid token but no roles at all', async () => {
    const app = createGuardedApp(configWithAuth)
    const jwt = buildFakeJwt({
      iss: TEST_ISSUER,
      sub: 'no-roles-user',
    })

    const response = await request(app).get('/protected').set('Authorization', `Bearer ${jwt}`)
    expect(response.status).toBe(HTTP_FORBIDDEN)
  })

  it('allows requests with a valid admin token', async () => {
    const app = createGuardedApp(configWithAuth)
    const jwt = buildFakeJwt({
      iss: TEST_ISSUER,
      sub: 'admin-user',
      client_roles: ['fdsc-admin'],
    })

    const response = await request(app).get('/protected').set('Authorization', `Bearer ${jwt}`)
    expect(response.status).toBe(HTTP_OK)
    expect(response.body.message).toBe('ok')
  })

  it('allows admin even when they also have viewer role', async () => {
    const app = createGuardedApp(configWithAuth)
    const jwt = buildFakeJwt({
      iss: TEST_ISSUER,
      sub: 'admin-user',
      client_roles: ['fdsc-viewer', 'fdsc-admin'],
    })

    const response = await request(app).get('/protected').set('Authorization', `Bearer ${jwt}`)
    expect(response.status).toBe(HTTP_OK)
  })
})

describe('createAdminAuthGuard — default claim path', () => {
  const configDefaultPath = createTestConfig({ authConfigJson: AUTH_CONFIG_DEFAULT_CLAIM_PATH })

  it('allows admin via default realm_access.roles path', async () => {
    const app = createGuardedApp(configDefaultPath)
    const jwt = buildFakeJwt({
      iss: TEST_ISSUER,
      sub: 'admin-user',
      realm_access: { roles: ['admin'] },
    })

    const response = await request(app).get('/protected').set('Authorization', `Bearer ${jwt}`)
    expect(response.status).toBe(HTTP_OK)
  })

  it('rejects viewer via default realm_access.roles path', async () => {
    const app = createGuardedApp(configDefaultPath)
    const jwt = buildFakeJwt({
      iss: TEST_ISSUER,
      sub: 'viewer-user',
      realm_access: { roles: ['viewer'] },
    })

    const response = await request(app).get('/protected').set('Authorization', `Bearer ${jwt}`)
    expect(response.status).toBe(HTTP_FORBIDDEN)
  })
})
