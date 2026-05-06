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
 * Tests for the BFF server configuration module.
 *
 * Verifies that environment variables are parsed correctly, that defaults
 * are applied when env vars are missing, and that the config env map
 * parameter avoids mutating process.env.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  parsePort,
  loadConfig,
  getEnabledServices,
  getApisixConfig,
  getGrafanaConfig,
} from '../config.js'
import { parseLogLevel } from '../logger.js'

/** Default port returned when PORT env var is missing or invalid. */
const DEFAULT_PORT = 3000

/** Default auth config JSON. */
const DEFAULT_AUTH_CONFIG_JSON = '{"providers":[]}'

/** Default static directory path. */
const DEFAULT_STATIC_DIR = '../dist'

describe('parsePort', () => {
  it.each([
    { input: undefined, label: 'undefined' },
    { input: '', label: 'empty string' },
    { input: 'abc', label: 'non-numeric string' },
    { input: '0', label: 'zero (below valid range)' },
    { input: '-1', label: 'negative number' },
    { input: '65536', label: 'above maximum port (65535)' },
    { input: '99999', label: 'well above maximum port' },
  ])(
    'returns default port for invalid input: $label',
    ({ input }) => {
      expect(parsePort(input)).toBe(DEFAULT_PORT)
    },
  )

  it.each([
    { input: '1', expected: 1, label: 'minimum valid port' },
    { input: '80', expected: 80, label: 'HTTP port' },
    { input: '443', expected: 443, label: 'HTTPS port' },
    { input: '3000', expected: 3000, label: 'default BFF port' },
    { input: '8080', expected: 8080, label: 'common dev port' },
    { input: '65535', expected: 65535, label: 'maximum valid port' },
  ])('parses valid port $input ($label)', ({ input, expected }) => {
    expect(parsePort(input)).toBe(expected)
  })
})

describe('loadConfig', () => {
  it('returns all default values when no env vars are set', () => {
    const config = loadConfig({})

    expect(config).toEqual({
      port: DEFAULT_PORT,
      tilApiUrl: '',
      tirApiUrl: '',
      ccsApiUrl: '',
      odrlApiUrl: '',
      apisixDashboardUrl: '',
      apisixAdminApiKey: '',
      authConfigJson: DEFAULT_AUTH_CONFIG_JSON,
      staticDir: DEFAULT_STATIC_DIR,
      logLevel: 'info',
      grafanaUrl: '',
      grafanaIframeUrl: '',
      grafanaPanelsJson: '[]',
    })
  })

  it('reads all custom values from env vars', () => {
    const env = {
      PORT: '9090',
      TIL_API_URL: 'http://custom-til:3000',
      TIR_API_URL: 'http://custom-tir:3000',
      CCS_API_URL: 'http://custom-ccs:3000',
      ODRL_API_URL: 'http://custom-odrl:3000',
      APISIX_DASHBOARD_URL: 'http://apisix:9000',
      APISIX_ADMIN_API_KEY: 'my-secret-key',
      AUTH_CONFIG_JSON: '{"providers":[{"name":"keycloak"}]}',
      STATIC_DIR: '/var/www/html',
      LOG_LEVEL: 'debug',
      GRAFANA_URL: 'http://grafana:3000',
      GRAFANA_IFRAME_URL: 'https://grafana.example.com',
      GRAFANA_PANELS_JSON: '[{"title":"Test","path":"/d-solo/abc/test?panelId=1"}]',
    }

    const config = loadConfig(env)

    expect(config).toEqual({
      port: 9090,
      tilApiUrl: 'http://custom-til:3000',
      tirApiUrl: 'http://custom-tir:3000',
      ccsApiUrl: 'http://custom-ccs:3000',
      odrlApiUrl: 'http://custom-odrl:3000',
      apisixDashboardUrl: 'http://apisix:9000',
      apisixAdminApiKey: 'my-secret-key',
      authConfigJson: '{"providers":[{"name":"keycloak"}]}',
      staticDir: '/var/www/html',
      logLevel: 'debug',
      grafanaUrl: 'http://grafana:3000',
      grafanaIframeUrl: 'https://grafana.example.com',
      grafanaPanelsJson: '[{"title":"Test","path":"/d-solo/abc/test?panelId=1"}]',
    })
  })

  it('falls back to default port when PORT is invalid', () => {
    const config = loadConfig({ PORT: 'not-a-number' })
    expect(config.port).toBe(DEFAULT_PORT)
  })

  it.each([
    { envVar: 'TIL_API_URL', configKey: 'tilApiUrl', value: 'http://my-til:9999' },
    { envVar: 'TIR_API_URL', configKey: 'tirApiUrl', value: 'http://my-tir:9999' },
    { envVar: 'CCS_API_URL', configKey: 'ccsApiUrl', value: 'http://my-ccs:9999' },
    { envVar: 'ODRL_API_URL', configKey: 'odrlApiUrl', value: 'http://my-odrl:9999' },
    { envVar: 'APISIX_DASHBOARD_URL', configKey: 'apisixDashboardUrl', value: 'http://apisix:9000' },
    { envVar: 'APISIX_ADMIN_API_KEY', configKey: 'apisixAdminApiKey', value: 'my-admin-key' },
    { envVar: 'AUTH_CONFIG_JSON', configKey: 'authConfigJson', value: '{"custom":true}' },
    { envVar: 'STATIC_DIR', configKey: 'staticDir', value: '/custom/path' },
    { envVar: 'LOG_LEVEL', configKey: 'logLevel', value: 'debug' },
  ])(
    'allows individual override of $envVar',
    ({ envVar, configKey, value }) => {
      const config = loadConfig({ [envVar]: value })
      expect(config[configKey as keyof typeof config]).toBe(value)
    },
  )

  it('does not mutate process.env when using custom env map', () => {
    const originalTilUrl = process.env.TIL_API_URL
    loadConfig({ TIL_API_URL: 'http://should-not-leak:1234' })
    expect(process.env.TIL_API_URL).toBe(originalTilUrl)
  })
})

describe('parseLogLevel', () => {
  it.each([
    { input: undefined, label: 'undefined' },
    { input: '', label: 'empty string' },
    { input: 'verbose', label: 'unrecognised level' },
    { input: 'trace', label: 'unsupported level' },
  ])('returns default level "info" for invalid input: $label', ({ input }) => {
    expect(parseLogLevel(input)).toBe('info')
  })

  it.each([
    { input: 'debug', expected: 'debug' },
    { input: 'info', expected: 'info' },
    { input: 'warn', expected: 'warn' },
    { input: 'error', expected: 'error' },
  ])('parses valid level "$input"', ({ input, expected }) => {
    expect(parseLogLevel(input)).toBe(expected)
  })

  it.each([
    { input: 'DEBUG', expected: 'debug' },
    { input: 'Info', expected: 'info' },
    { input: 'WARN', expected: 'warn' },
    { input: '  error  ', expected: 'error' },
  ])('handles case-insensitive and trimmed input "$input"', ({ input, expected }) => {
    expect(parseLogLevel(input)).toBe(expected)
  })
})

describe('getEnabledServices', () => {
  it('marks all services as disabled when no URLs are configured', () => {
    const config = loadConfig({})
    expect(getEnabledServices(config)).toEqual({
      til: false,
      tir: false,
      ccs: false,
      odrl: false,
    })
  })

  it('marks all services as enabled when all URLs are configured', () => {
    const config = loadConfig({
      TIL_API_URL: 'http://til:8080',
      TIR_API_URL: 'http://tir:8080',
      CCS_API_URL: 'http://ccs:8080',
      ODRL_API_URL: 'http://odrl:8080',
    })
    expect(getEnabledServices(config)).toEqual({
      til: true,
      tir: true,
      ccs: true,
      odrl: true,
    })
  })

  it.each([
    { envVar: 'TIL_API_URL', service: 'til' },
    { envVar: 'TIR_API_URL', service: 'tir' },
    { envVar: 'CCS_API_URL', service: 'ccs' },
    { envVar: 'ODRL_API_URL', service: 'odrl' },
  ])(
    'enables only $service when only $envVar is set',
    ({ envVar, service }) => {
      const config = loadConfig({ [envVar]: 'http://example:8080' })
      const services = getEnabledServices(config)
      expect(services[service as keyof typeof services]).toBe(true)
      const otherServices = Object.entries(services).filter(([k]) => k !== service)
      for (const [, enabled] of otherServices) {
        expect(enabled).toBe(false)
      }
    },
  )
})

describe('getApisixConfig', () => {
  it('returns null upstream URL when APISIX_DASHBOARD_URL is not set', () => {
    const config = loadConfig({})
    expect(getApisixConfig(config)).toEqual({ upstreamUrl: null })
  })

  it('returns the configured upstream URL when APISIX_DASHBOARD_URL is set', () => {
    const config = loadConfig({ APISIX_DASHBOARD_URL: 'https://apisix.example.com/ui' })
    expect(getApisixConfig(config)).toEqual({ upstreamUrl: 'https://apisix.example.com/ui' })
  })

  it('returns null upstream URL when APISIX_DASHBOARD_URL is empty string', () => {
    const config = loadConfig({ APISIX_DASHBOARD_URL: '' })
    expect(getApisixConfig(config)).toEqual({ upstreamUrl: null })
  })
})

describe('getGrafanaConfig', () => {
  it('returns null upstream URL and empty panels when GRAFANA_URL is not set', () => {
    const config = loadConfig({})
    expect(getGrafanaConfig(config)).toEqual({ upstreamUrl: null, iframeUrl: null, panels: [] })
  })

  it('returns null upstream URL and empty panels when GRAFANA_URL is empty string', () => {
    const config = loadConfig({ GRAFANA_URL: '' })
    expect(getGrafanaConfig(config)).toEqual({ upstreamUrl: null, iframeUrl: null, panels: [] })
  })

  it('returns the upstream URL and empty panels when only GRAFANA_URL is set', () => {
    const config = loadConfig({ GRAFANA_URL: 'http://grafana:3000' })
    expect(getGrafanaConfig(config)).toEqual({
      upstreamUrl: 'http://grafana:3000',
      iframeUrl: null,
      panels: [],
    })
  })

  it('returns parsed panels when both GRAFANA_URL and GRAFANA_PANELS_JSON are set', () => {
    const panels = [
      { title: 'CPU', path: '/d-solo/abc/cpu?panelId=1&kiosk', span: 6, height: 400 },
      { title: 'Memory', path: '/d-solo/abc/mem?panelId=2&kiosk' },
    ]
    const config = loadConfig({
      GRAFANA_URL: 'http://grafana:3000',
      GRAFANA_PANELS_JSON: JSON.stringify(panels),
    })
    expect(getGrafanaConfig(config)).toEqual({
      upstreamUrl: 'http://grafana:3000',
      iframeUrl: null,
      panels,
    })
  })

  it('includes iframeUrl when GRAFANA_IFRAME_URL is set', () => {
    const config = loadConfig({
      GRAFANA_URL: 'http://grafana:3000',
      GRAFANA_IFRAME_URL: 'https://grafana.example.com',
    })
    expect(getGrafanaConfig(config)).toEqual({
      upstreamUrl: 'http://grafana:3000',
      iframeUrl: 'https://grafana.example.com',
      panels: [],
    })
  })

  it('returns null iframeUrl when GRAFANA_IFRAME_URL is empty', () => {
    const config = loadConfig({
      GRAFANA_URL: 'http://grafana:3000',
      GRAFANA_IFRAME_URL: '',
    })
    expect(getGrafanaConfig(config).iframeUrl).toBeNull()
  })

  it('falls back to empty panels when GRAFANA_PANELS_JSON is invalid JSON', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = loadConfig({
      GRAFANA_URL: 'http://grafana:3000',
      GRAFANA_PANELS_JSON: 'not-json',
    })
    expect(getGrafanaConfig(config)).toEqual({
      upstreamUrl: 'http://grafana:3000',
      iframeUrl: null,
      panels: [],
    })
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('invalid JSON'),
    )
    consoleSpy.mockRestore()
  })

  it('falls back to empty panels when GRAFANA_PANELS_JSON is not an array', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = loadConfig({
      GRAFANA_URL: 'http://grafana:3000',
      GRAFANA_PANELS_JSON: '{"not":"array"}',
    })
    expect(getGrafanaConfig(config)).toEqual({
      upstreamUrl: 'http://grafana:3000',
      iframeUrl: null,
      panels: [],
    })
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('not a JSON array'),
    )
    consoleSpy.mockRestore()
  })

  it('ignores panels when GRAFANA_URL is empty even if GRAFANA_PANELS_JSON is set', () => {
    const config = loadConfig({
      GRAFANA_URL: '',
      GRAFANA_PANELS_JSON: '[{"title":"Test","path":"/d-solo/x/y"}]',
    })
    expect(getGrafanaConfig(config)).toEqual({ upstreamUrl: null, iframeUrl: null, panels: [] })
  })
})
