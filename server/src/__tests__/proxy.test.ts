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
 * Tests for the BFF proxy middleware.
 *
 * Verifies that proxy routes are created for all four downstream services
 * with correct target URLs, path rewriting, and change-origin settings.
 * Uses a mock of http-proxy-middleware to avoid real network calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import type { AppConfig } from '../config.js'
import type { Logger } from '../logger.js'

// Mock http-proxy-middleware — vitest hoists this above imports
vi.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: vi.fn(
    () =>
      (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
        next(),
  ),
}))

// Must import after the mock declaration so vitest can intercept
const { mountProxyMiddleware, extractUsernameFromJwt } = await import('../proxy.js')

/** Typed reference to the mocked createProxyMiddleware function. */
const mockedCreateProxy = vi.mocked(createProxyMiddleware)

/** Total number of downstream services proxied through the BFF. */
const EXPECTED_PROXY_COUNT = 4

/**
 * Creates a test AppConfig with optional overrides.
 *
 * @param overrides - Partial config values to override defaults
 * @returns A complete AppConfig suitable for testing
 */
function createTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 3000,
    tilApiUrl: 'http://til:8080',
    tirApiUrl: 'http://tir:8080',
    ccsApiUrl: 'http://ccs:8080',
    odrlApiUrl: 'http://odrl:8080',
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

describe('mountProxyMiddleware', () => {
  beforeEach(() => {
    mockedCreateProxy.mockClear()
  })

  it('creates proxy middleware for all four downstream services when all are configured', () => {
    const app = express()
    mountProxyMiddleware(app, createTestConfig(), createMockLogger())

    expect(mockedCreateProxy).toHaveBeenCalledTimes(EXPECTED_PROXY_COUNT)
  })

  it('skips proxy middleware for services with empty URLs', () => {
    const app = express()
    const partialConfig = createTestConfig({ tirApiUrl: '', odrlApiUrl: '' })
    mountProxyMiddleware(app, partialConfig, createMockLogger())

    const EXPECTED_ENABLED_COUNT = 2
    expect(mockedCreateProxy).toHaveBeenCalledTimes(EXPECTED_ENABLED_COUNT)

    const targets = mockedCreateProxy.mock.calls.map(
      (args) => (args[0] as Record<string, unknown>)?.target,
    )
    expect(targets).toContain('http://til:8080')
    expect(targets).toContain('http://ccs:8080')
    expect(targets).not.toContain('')
  })

  it('creates no proxy middleware when all service URLs are empty', () => {
    const app = express()
    const emptyConfig = createTestConfig({
      tilApiUrl: '',
      tirApiUrl: '',
      ccsApiUrl: '',
      odrlApiUrl: '',
    })
    mountProxyMiddleware(app, emptyConfig, createMockLogger())

    expect(mockedCreateProxy).not.toHaveBeenCalled()
  })

  it.each([
    {
      service: 'Trusted Issuers List (TIL)',
      path: '/api/til',
      configKey: 'tilApiUrl' as const,
      targetUrl: 'http://til:8080',
    },
    {
      service: 'Trusted Issuers Registry (TIR)',
      path: '/api/tir',
      configKey: 'tirApiUrl' as const,
      targetUrl: 'http://tir:8080',
    },
    {
      service: 'Credentials Config Service (CCS)',
      path: '/api/ccs',
      configKey: 'ccsApiUrl' as const,
      targetUrl: 'http://ccs:8080',
    },
    {
      service: 'ODRL Policy (ODRL)',
      path: '/api/odrl',
      configKey: 'odrlApiUrl' as const,
      targetUrl: 'http://odrl:8080',
    },
  ])(
    'configures $service proxy with correct target URL',
    ({ targetUrl }) => {
      const app = express()
      mountProxyMiddleware(app, createTestConfig(), createMockLogger())

      const matchingCall = mockedCreateProxy.mock.calls.find(
        (args) => (args[0] as Record<string, unknown>)?.target === targetUrl,
      )
      expect(matchingCall).toBeDefined()
    },
  )

  it.each([
    { service: 'TIL', path: '/api/til', targetUrl: 'http://til:8080' },
    { service: 'TIR', path: '/api/tir', targetUrl: 'http://tir:8080' },
    { service: 'CCS', path: '/api/ccs', targetUrl: 'http://ccs:8080' },
    { service: 'ODRL', path: '/api/odrl', targetUrl: 'http://odrl:8080' },
  ])(
    'strips $path prefix via pathRewrite for $service proxy',
    ({ path, targetUrl }) => {
      const app = express()
      mountProxyMiddleware(app, createTestConfig(), createMockLogger())

      const matchingCall = mockedCreateProxy.mock.calls.find(
        (args) => (args[0] as Record<string, unknown>)?.target === targetUrl,
      )
      expect(matchingCall).toBeDefined()

      const options = matchingCall![0] as Record<string, unknown>
      expect(options.pathRewrite).toEqual({ [`^${path}`]: '' })
    },
  )

  it.each([
    { service: 'TIL', targetUrl: 'http://til:8080' },
    { service: 'TIR', targetUrl: 'http://tir:8080' },
    { service: 'CCS', targetUrl: 'http://ccs:8080' },
    { service: 'ODRL', targetUrl: 'http://odrl:8080' },
  ])(
    'enables changeOrigin for $service proxy',
    ({ targetUrl }) => {
      const app = express()
      mountProxyMiddleware(app, createTestConfig(), createMockLogger())

      const matchingCall = mockedCreateProxy.mock.calls.find(
        (args) => (args[0] as Record<string, unknown>)?.target === targetUrl,
      )
      expect(matchingCall).toBeDefined()

      const options = matchingCall![0] as Record<string, unknown>
      expect(options.changeOrigin).toBe(true)
    },
  )

  it('uses custom URLs from config for each service', () => {
    const customConfig = createTestConfig({
      tilApiUrl: 'http://custom-til:9000',
      tirApiUrl: 'http://custom-tir:9001',
      ccsApiUrl: 'http://custom-ccs:9002',
      odrlApiUrl: 'http://custom-odrl:9003',
    })

    const app = express()
    mountProxyMiddleware(app, customConfig, createMockLogger())

    const targets = mockedCreateProxy.mock.calls.map(
      (args) => (args[0] as Record<string, unknown>)?.target,
    )

    expect(targets).toContain('http://custom-til:9000')
    expect(targets).toContain('http://custom-tir:9001')
    expect(targets).toContain('http://custom-ccs:9002')
    expect(targets).toContain('http://custom-odrl:9003')
  })

  it('mounts Apisix Dashboard proxy, asset path proxy, and admin API proxy when apisixDashboardUrl is configured', () => {
    const app = express()
    const configWithApisix = createTestConfig({
      apisixDashboardUrl: 'http://apisix:9180/ui',
    })
    mountProxyMiddleware(app, configWithApisix, createMockLogger())

    const EXPECTED_COUNT_WITH_APISIX_ASSETS_AND_ADMIN = 7
    expect(mockedCreateProxy).toHaveBeenCalledTimes(EXPECTED_COUNT_WITH_APISIX_ASSETS_AND_ADMIN)

    const targets = mockedCreateProxy.mock.calls.map(
      (args) => (args[0] as Record<string, unknown>)?.target,
    )
    expect(targets).toContain('http://apisix:9180/ui')

    const assetProxyCall = mockedCreateProxy.mock.calls.find((args) => {
      const opts = args[0] as Record<string, unknown>
      return opts.target === 'http://apisix:9180/ui'
        && JSON.stringify(opts.pathRewrite).includes('^/ui')
    })
    expect(assetProxyCall).toBeDefined()

    const adminProxyCall = mockedCreateProxy.mock.calls.find((args) => {
      const opts = args[0] as Record<string, unknown>
      return opts.target === 'http://apisix:9180/apisix'
        && JSON.stringify(opts.pathRewrite).includes('^/apisix')
    })
    expect(adminProxyCall).toBeDefined()
  })

  it('does not add asset path proxy when apisixDashboardUrl has no path but still adds admin API proxy', () => {
    const app = express()
    const configWithApisix = createTestConfig({
      apisixDashboardUrl: 'http://apisix:9000',
    })
    mountProxyMiddleware(app, configWithApisix, createMockLogger())

    const EXPECTED_COUNT_WITH_APISIX_AND_ADMIN_NO_ASSETS = 6
    expect(mockedCreateProxy).toHaveBeenCalledTimes(EXPECTED_COUNT_WITH_APISIX_AND_ADMIN_NO_ASSETS)
  })

  it('does not mount Apisix Dashboard proxy when apisixDashboardUrl is empty', () => {
    const app = express()
    mountProxyMiddleware(app, createTestConfig(), createMockLogger())

    const targets = mockedCreateProxy.mock.calls.map(
      (args) => (args[0] as Record<string, unknown>)?.target,
    )
    expect(targets).not.toContain('')
    expect(mockedCreateProxy).toHaveBeenCalledTimes(EXPECTED_PROXY_COUNT)
  })

  it('injects X-API-KEY header on Apisix Admin API proxy when apisixAdminApiKey is configured', () => {
    const app = express()
    const configWithKey = createTestConfig({
      apisixDashboardUrl: 'http://apisix:9180/ui',
      apisixAdminApiKey: 'my-secret-key',
    })
    mountProxyMiddleware(app, configWithKey, createMockLogger())

    const adminCall = mockedCreateProxy.mock.calls.find((args) => {
      const opts = args[0] as Record<string, unknown>
      return opts.target === 'http://apisix:9180/apisix' && opts.pathRewrite !== undefined
        && JSON.stringify(opts.pathRewrite).includes('^/apisix')
    })
    expect(adminCall).toBeDefined()

    const options = adminCall![0] as Record<string, unknown>
    const on = options.on as Record<string, (...args: unknown[]) => void>
    const fakeProxyReq = {
      setHeader: vi.fn(),
    }
    const fakeReq = { method: 'GET', url: '/admin/routes' }

    on.proxyReq(fakeProxyReq, fakeReq)
    expect(fakeProxyReq.setHeader).toHaveBeenCalledWith('X-API-KEY', 'my-secret-key')
  })

  it('does not inject X-API-KEY header when apisixAdminApiKey is empty', () => {
    const app = express()
    const configNoKey = createTestConfig({
      apisixDashboardUrl: 'http://apisix:9180/ui',
      apisixAdminApiKey: '',
    })
    mountProxyMiddleware(app, configNoKey, createMockLogger())

    const adminCall = mockedCreateProxy.mock.calls.find((args) => {
      const opts = args[0] as Record<string, unknown>
      return opts.target === 'http://apisix:9180/apisix' && opts.pathRewrite !== undefined
        && JSON.stringify(opts.pathRewrite).includes('^/apisix')
    })
    expect(adminCall).toBeDefined()

    const options = adminCall![0] as Record<string, unknown>
    const on = options.on as Record<string, (...args: unknown[]) => void>
    const fakeProxyReq = {
      setHeader: vi.fn(),
    }
    const fakeReq = { method: 'GET', url: '/admin/routes' }

    on.proxyReq(fakeProxyReq, fakeReq)
    expect(fakeProxyReq.setHeader).not.toHaveBeenCalledWith(
      'X-API-KEY',
      expect.anything(),
    )
  })

  it('does not inject X-API-KEY header on regular service proxies', () => {
    const app = express()
    const configWithKey = createTestConfig({
      apisixDashboardUrl: 'http://apisix:9180/ui',
      apisixAdminApiKey: 'my-secret-key',
    })
    mountProxyMiddleware(app, configWithKey, createMockLogger())

    const tilCall = mockedCreateProxy.mock.calls.find(
      (args) => (args[0] as Record<string, unknown>)?.target === 'http://til:8080',
    )
    expect(tilCall).toBeDefined()

    const options = tilCall![0] as Record<string, unknown>
    const on = options.on as Record<string, (...args: unknown[]) => void>
    const fakeProxyReq = {
      setHeader: vi.fn(),
    }
    const fakeReq = { method: 'GET', url: '/v4/issuers' }

    on.proxyReq(fakeProxyReq, fakeReq)
    expect(fakeProxyReq.setHeader).not.toHaveBeenCalled()
  })

  it.each([
    { service: 'TIL', targetUrl: 'http://til:8080' },
    { service: 'TIR', targetUrl: 'http://tir:8080' },
    { service: 'CCS', targetUrl: 'http://ccs:8080' },
    { service: 'ODRL', targetUrl: 'http://odrl:8080' },
  ])(
    'registers on.error, on.proxyReq, and on.proxyRes handlers for $service proxy',
    ({ targetUrl }) => {
      const app = express()
      mountProxyMiddleware(app, createTestConfig(), createMockLogger())

      const matchingCall = mockedCreateProxy.mock.calls.find(
        (args) => (args[0] as Record<string, unknown>)?.target === targetUrl,
      )
      expect(matchingCall).toBeDefined()

      const options = matchingCall![0] as Record<string, unknown>
      const on = options.on as Record<string, unknown>
      expect(on).toBeDefined()
      expect(typeof on.error).toBe('function')
      expect(typeof on.proxyReq).toBe('function')
      expect(typeof on.proxyRes).toBe('function')
    },
  )

  it('error handler sends 502 with JSON body when upstream is unreachable', () => {
    const app = express()
    const mockLogger = createMockLogger()
    mountProxyMiddleware(app, createTestConfig(), mockLogger)

    const options = mockedCreateProxy.mock.calls[0]![0] as Record<string, unknown>
    const onError = (options.on as Record<string, (...args: unknown[]) => void>).error

    const fakeReq = { method: 'GET', url: '/v4/issuers' }
    let writtenStatus: number | undefined
    let writtenBody = ''
    const fakeRes = {
      writeHead: (status: number) => {
        writtenStatus = status
      },
      headersSent: false,
      end: (body: string) => {
        writtenBody = body
      },
    }

    onError(new Error('ECONNREFUSED'), fakeReq, fakeRes)

    const EXPECTED_BAD_GATEWAY = 502
    expect(writtenStatus).toBe(EXPECTED_BAD_GATEWAY)

    const parsed = JSON.parse(writtenBody)
    expect(parsed.error).toBe('Bad Gateway')
    expect(parsed.message).toContain('ECONNREFUSED')
    expect(mockLogger.error).toHaveBeenCalled()
  })

  it('error handler does not write headers when they are already sent', () => {
    const app = express()
    const mockLogger = createMockLogger()
    mountProxyMiddleware(app, createTestConfig(), mockLogger)

    const options = mockedCreateProxy.mock.calls[0]![0] as Record<string, unknown>
    const onError = (options.on as Record<string, (...args: unknown[]) => void>).error

    const fakeReq = { method: 'GET', url: '/v4/issuers' }
    let writeHeadCalled = false
    const fakeRes = {
      writeHead: () => {
        writeHeadCalled = true
      },
      headersSent: true,
      end: () => {},
    }

    onError(new Error('ECONNREFUSED'), fakeReq, fakeRes)

    expect(writeHeadCalled).toBe(false)
    expect(mockLogger.error).toHaveBeenCalled()
  })
})

describe('extractUsernameFromJwt', () => {
  /**
   * Builds a fake JWT with the given payload (no signature verification needed).
   * The header and signature are placeholders — only the payload matters.
   */
  function buildFakeJwt(payload: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url')
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    return `${header}.${body}.fakesignature`
  }

  it('extracts preferred_username from a valid JWT', () => {
    const token = buildFakeJwt({ preferred_username: 'alice', sub: 'user-123' })
    expect(extractUsernameFromJwt(`Bearer ${token}`)).toBe('alice')
  })

  it('falls back to sub when preferred_username is not present', () => {
    const token = buildFakeJwt({ sub: 'user-456' })
    expect(extractUsernameFromJwt(`Bearer ${token}`)).toBe('user-456')
  })

  it('returns null when Authorization header is undefined', () => {
    expect(extractUsernameFromJwt(undefined)).toBeNull()
  })

  it('returns null when Authorization header is empty string', () => {
    expect(extractUsernameFromJwt('')).toBeNull()
  })

  it('returns null when Authorization header does not start with Bearer', () => {
    expect(extractUsernameFromJwt('Basic abc123')).toBeNull()
  })

  it('returns null when the token has fewer than 2 segments', () => {
    expect(extractUsernameFromJwt('Bearer single-segment')).toBeNull()
  })

  it('returns null when the payload is not valid JSON', () => {
    expect(extractUsernameFromJwt('Bearer header.!!!invalid!!!.sig')).toBeNull()
  })

  it('returns null when payload has no username claims', () => {
    const token = buildFakeJwt({ email: 'test@example.com' })
    expect(extractUsernameFromJwt(`Bearer ${token}`)).toBeNull()
  })

  it('returns null when sub is an empty string', () => {
    const token = buildFakeJwt({ sub: '' })
    expect(extractUsernameFromJwt(`Bearer ${token}`)).toBeNull()
  })

  it('returns null when sub is not a string', () => {
    const token = buildFakeJwt({ sub: 12345 })
    expect(extractUsernameFromJwt(`Bearer ${token}`)).toBeNull()
  })
})

describe('Grafana proxy route', () => {
  /** Expected proxy count including the Grafana route. */
  const EXPECTED_PROXY_COUNT_WITH_GRAFANA = EXPECTED_PROXY_COUNT + 1

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not mount a Grafana proxy when grafanaUrl is empty', () => {
    const app = express()
    const mockLogger = createMockLogger()
    mountProxyMiddleware(app, createTestConfig({ grafanaUrl: '' }), mockLogger)

    expect(mockedCreateProxy).toHaveBeenCalledTimes(EXPECTED_PROXY_COUNT)
  })

  it('mounts a Grafana proxy when grafanaUrl is configured', () => {
    const app = express()
    const mockLogger = createMockLogger()
    mountProxyMiddleware(
      app,
      createTestConfig({ grafanaUrl: 'http://grafana:3000' }),
      mockLogger,
    )

    expect(mockedCreateProxy).toHaveBeenCalledTimes(EXPECTED_PROXY_COUNT_WITH_GRAFANA)
  })

  it('targets the configured Grafana URL in the proxy options', () => {
    const app = express()
    const mockLogger = createMockLogger()
    mountProxyMiddleware(
      app,
      createTestConfig({ grafanaUrl: 'http://grafana:3000' }),
      mockLogger,
    )

    // The last createProxyMiddleware call should be the Grafana proxy
    const lastCall = mockedCreateProxy.mock.calls[EXPECTED_PROXY_COUNT]
    const options = lastCall![0] as Record<string, unknown>
    expect(options.target).toBe('http://grafana:3000')
  })

  it('injects X-WEBAUTH-USER header from JWT on Grafana proxy requests', () => {
    const app = express()
    const mockLogger = createMockLogger()
    mountProxyMiddleware(
      app,
      createTestConfig({ grafanaUrl: 'http://grafana:3000' }),
      mockLogger,
    )

    const lastCall = mockedCreateProxy.mock.calls[EXPECTED_PROXY_COUNT]
    const options = lastCall![0] as Record<string, unknown>
    const onProxyReq = (options.on as Record<string, (...args: unknown[]) => void>).proxyReq

    const token = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url') +
      '.' + Buffer.from(JSON.stringify({ preferred_username: 'grafana-user' })).toString('base64url') +
      '.fakesig'

    const headers: Record<string, string> = {}
    const fakeProxyReq = {
      setHeader: (name: string, value: string) => {
        headers[name] = value
      },
    }
    const fakeReq = { headers: { authorization: `Bearer ${token}` } }

    onProxyReq(fakeProxyReq, fakeReq, {}, {})

    expect(headers['X-WEBAUTH-USER']).toBe('grafana-user')
  })

  it('does not inject X-WEBAUTH-USER when no Authorization header is present', () => {
    const app = express()
    const mockLogger = createMockLogger()
    mountProxyMiddleware(
      app,
      createTestConfig({ grafanaUrl: 'http://grafana:3000' }),
      mockLogger,
    )

    const lastCall = mockedCreateProxy.mock.calls[EXPECTED_PROXY_COUNT]
    const options = lastCall![0] as Record<string, unknown>
    const onProxyReq = (options.on as Record<string, (...args: unknown[]) => void>).proxyReq

    const headers: Record<string, string> = {}
    const fakeProxyReq = {
      setHeader: (name: string, value: string) => {
        headers[name] = value
      },
    }
    const fakeReq = { headers: {} }

    onProxyReq(fakeProxyReq, fakeReq, {}, {})

    expect(headers['X-WEBAUTH-USER']).toBeUndefined()
  })
})
