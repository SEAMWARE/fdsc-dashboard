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
 * Tests for the BFF runtime configuration endpoint.
 *
 * Verifies that GET /config.js returns valid JavaScript that assigns
 * auth configuration to `window.__AUTH_CONFIG__`, with the correct
 * content type and handling of various config values.
 */

import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createRuntimeConfigRouter } from '../runtime-config.js'
import type { AppConfig } from '../config.js'

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
    logLevel: 'info',
    grafanaUrl: '',
    grafanaIframeUrl: '',
    grafanaPanelsJson: '[]',
    ...overrides,
  }
}

describe('GET /config.js', () => {
  it('returns 200 status code', async () => {
    const app = express()
    app.use(createRuntimeConfigRouter(createTestConfig()))

    const res = await request(app).get('/config.js')
    expect(res.status).toBe(200)
  })

  it('returns application/javascript content type', async () => {
    const app = express()
    app.use(createRuntimeConfigRouter(createTestConfig()))

    const res = await request(app).get('/config.js')
    expect(res.headers['content-type']).toMatch(/application\/javascript/)
  })

  it('returns JavaScript assigning auth, services, and apisix config to window globals', async () => {
    const app = express()
    app.use(createRuntimeConfigRouter(createTestConfig()))

    const res = await request(app).get('/config.js')
    expect(res.text).toContain('window.__AUTH_CONFIG__ = {"providers":[]};')
    expect(res.text).toContain(
      'window.__SERVICES_CONFIG__ = {"til":true,"tir":true,"ccs":true,"odrl":true};',
    )
    expect(res.text).toContain('window.__APISIX_CONFIG__ = {"upstreamUrl":null};')
  })

  it('embeds custom auth provider configuration', async () => {
    const authJson = '{"providers":[{"name":"keycloak","url":"https://auth.example.com"}]}'
    const app = express()
    app.use(createRuntimeConfigRouter(createTestConfig({ authConfigJson: authJson })))

    const res = await request(app).get('/config.js')
    expect(res.text).toContain(`window.__AUTH_CONFIG__ = ${authJson};`)
  })

  it('handles complex auth configuration with multiple providers', async () => {
    const authJson =
      '{"providers":[{"name":"keycloak","url":"https://kc.example.com"},{"name":"github","clientId":"abc123"}]}'
    const app = express()
    app.use(createRuntimeConfigRouter(createTestConfig({ authConfigJson: authJson })))

    const res = await request(app).get('/config.js')
    expect(res.text).toContain('window.__AUTH_CONFIG__')
    expect(res.text).toContain('keycloak')
    expect(res.text).toContain('github')
  })

  it('marks disabled services as false in __SERVICES_CONFIG__', async () => {
    const app = express()
    app.use(
      createRuntimeConfigRouter(
        createTestConfig({ tirApiUrl: '', odrlApiUrl: '' }),
      ),
    )

    const res = await request(app).get('/config.js')
    expect(res.text).toContain(
      'window.__SERVICES_CONFIG__ = {"til":true,"tir":false,"ccs":true,"odrl":false};',
    )
  })

  it('injects Apisix upstream URL into __APISIX_CONFIG__ when configured', async () => {
    const app = express()
    app.use(
      createRuntimeConfigRouter(
        createTestConfig({ apisixDashboardUrl: 'https://apisix.example.com/ui' }),
      ),
    )

    const res = await request(app).get('/config.js')
    expect(res.text).toContain(
      'window.__APISIX_CONFIG__ = {"upstreamUrl":"https://apisix.example.com/ui"};',
    )
  })

  it('injects null upstream URL into __APISIX_CONFIG__ when not configured', async () => {
    const app = express()
    app.use(createRuntimeConfigRouter(createTestConfig({ apisixDashboardUrl: '' })))

    const res = await request(app).get('/config.js')
    expect(res.text).toContain('window.__APISIX_CONFIG__ = {"upstreamUrl":null};')
  })

  it('includes __GRAFANA_CONFIG__ in the config.js response', async () => {
    const app = express()
    app.use(createRuntimeConfigRouter(createTestConfig({ grafanaUrl: '' })))

    const res = await request(app).get('/config.js')
    expect(res.text).toContain('window.__GRAFANA_CONFIG__')
  })

  it('injects null upstream URL and empty panels when Grafana is not configured', async () => {
    const app = express()
    app.use(createRuntimeConfigRouter(createTestConfig({ grafanaUrl: '' })))

    const res = await request(app).get('/config.js')
    expect(res.text).toContain(
      'window.__GRAFANA_CONFIG__ = {"upstreamUrl":null,"iframeUrl":null,"panels":[]};',
    )
  })

  it('injects the Grafana upstream URL and parsed panels when configured', async () => {
    const panels = [{ title: 'CPU', path: '/d-solo/abc/cpu?panelId=1' }]
    const app = express()
    app.use(
      createRuntimeConfigRouter(
        createTestConfig({
          grafanaUrl: 'http://grafana:3000',
          grafanaPanelsJson: JSON.stringify(panels),
        }),
      ),
    )

    const res = await request(app).get('/config.js')
    const expected = JSON.stringify({
      upstreamUrl: 'http://grafana:3000',
      iframeUrl: null,
      panels,
    })
    expect(res.text).toContain(`window.__GRAFANA_CONFIG__ = ${expected};`)
  })

  it('injects the Grafana iframe URL when GRAFANA_IFRAME_URL is configured', async () => {
    const app = express()
    app.use(
      createRuntimeConfigRouter(
        createTestConfig({
          grafanaUrl: 'http://grafana:3000',
          grafanaIframeUrl: 'https://grafana.example.com',
        }),
      ),
    )

    const res = await request(app).get('/config.js')
    const expected = JSON.stringify({
      upstreamUrl: 'http://grafana:3000',
      iframeUrl: 'https://grafana.example.com',
      panels: [],
    })
    expect(res.text).toContain(`window.__GRAFANA_CONFIG__ = ${expected};`)
  })
})
