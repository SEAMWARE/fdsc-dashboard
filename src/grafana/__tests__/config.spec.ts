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
 * Unit tests for the Grafana Dashboard configuration loader.
 *
 * Covers:
 * - Empty / missing config in both sources -> `upstreamUrl` is `null`.
 * - Runtime `window.__GRAFANA_CONFIG__` takes precedence over env var.
 * - Build-time `VITE_GRAFANA_URL` env var fallback (URL only, no panels).
 * - Whitespace-only values are treated as unset.
 * - Panel parsing: valid, invalid, and mixed entries.
 * - `isGrafanaConfigured` helper returns the correct boolean.
 * - Returned config objects are frozen.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isGrafanaConfigured, loadGrafanaConfig } from '@/grafana/config'
import {
  BUILD_TIME_GRAFANA_URL_ENV_VAR,
  RUNTIME_GRAFANA_CONFIG_GLOBAL,
} from '@/grafana/constants'
import type { GrafanaConfig } from '@/grafana/types'

/** A valid upstream URL used in test fixtures. */
const VALID_UPSTREAM_URL = 'http://grafana:3000'

/** An alternative URL to verify precedence. */
const ALT_UPSTREAM_URL = 'http://other-grafana:3100'

/** A sample panels array for runtime config tests. */
const SAMPLE_PANELS = [
  { title: 'CPU Usage', path: '/d-solo/abc/cpu?panelId=1&kiosk', span: 6, height: 400 },
  { title: 'Memory', path: '/d-solo/abc/mem?panelId=2&kiosk' },
]

/**
 * Set the runtime global `window.__GRAFANA_CONFIG__` to the given value.
 *
 * @param value - the value to assign.
 */
function setRuntimeConfig(value: unknown): void {
  (window as unknown as Record<string, unknown>)[RUNTIME_GRAFANA_CONFIG_GLOBAL] = value
}

/** Remove the runtime global so tests do not leak state. */
function clearRuntimeConfig(): void {
  delete (window as unknown as Record<string, unknown>)[RUNTIME_GRAFANA_CONFIG_GLOBAL]
}

/**
 * Temporarily override a Vite env var; returns a restorer function.
 *
 * @param name - the env var name.
 * @param value - the value to set, or `undefined` to delete.
 * @returns a function that restores the original value.
 */
function stubEnv(name: string, value: string | undefined): () => void {
  const env = import.meta.env as unknown as Record<string, unknown>
  const had = name in env
  const previous = env[name]
  if (value === undefined) {
    delete env[name]
  } else {
    env[name] = value
  }
  return () => {
    if (had) {
      env[name] = previous
    } else {
      delete env[name]
    }
  }
}

describe('loadGrafanaConfig', () => {
  let restoreEnv: () => void = () => {}

  beforeEach(() => {
    restoreEnv = stubEnv(BUILD_TIME_GRAFANA_URL_ENV_VAR, undefined)
    clearRuntimeConfig()
  })

  afterEach(() => {
    restoreEnv()
    clearRuntimeConfig()
  })

  it('returns null upstreamUrl and empty panels when neither source is present', () => {
    const config = loadGrafanaConfig()
    expect(config.upstreamUrl).toBeNull()
    expect(config.panels).toEqual([])
    expect(isGrafanaConfigured(config)).toBe(false)
  })

  it('reads from the runtime global when set with URL and panels', () => {
    setRuntimeConfig({ upstreamUrl: VALID_UPSTREAM_URL, panels: SAMPLE_PANELS })
    const config = loadGrafanaConfig()
    expect(config.upstreamUrl).toBe(VALID_UPSTREAM_URL)
    expect(config.iframeUrl).toBeNull()
    expect(config.panels).toHaveLength(SAMPLE_PANELS.length)
    expect(config.panels[0].title).toBe('CPU Usage')
    expect(config.panels[1].title).toBe('Memory')
    expect(isGrafanaConfigured(config)).toBe(true)
  })

  it('reads from the runtime global when set with URL only (no panels key)', () => {
    setRuntimeConfig({ upstreamUrl: VALID_UPSTREAM_URL })
    const config = loadGrafanaConfig()
    expect(config.upstreamUrl).toBe(VALID_UPSTREAM_URL)
    expect(config.iframeUrl).toBeNull()
    expect(config.panels).toEqual([])
    expect(isGrafanaConfigured(config)).toBe(true)
  })

  it('reads iframeUrl from the runtime global when set', () => {
    setRuntimeConfig({
      upstreamUrl: VALID_UPSTREAM_URL,
      iframeUrl: 'https://grafana.example.com',
      panels: [],
    })
    const config = loadGrafanaConfig()
    expect(config.iframeUrl).toBe('https://grafana.example.com')
  })

  it('returns null iframeUrl when not present in runtime config', () => {
    setRuntimeConfig({ upstreamUrl: VALID_UPSTREAM_URL, panels: [] })
    const config = loadGrafanaConfig()
    expect(config.iframeUrl).toBeNull()
  })

  it('treats blank iframeUrl as null', () => {
    setRuntimeConfig({ upstreamUrl: VALID_UPSTREAM_URL, iframeUrl: '   ', panels: [] })
    const config = loadGrafanaConfig()
    expect(config.iframeUrl).toBeNull()
  })

  it('falls back to the Vite env var when no runtime config is present', () => {
    restoreEnv()
    restoreEnv = stubEnv(BUILD_TIME_GRAFANA_URL_ENV_VAR, VALID_UPSTREAM_URL)
    const config = loadGrafanaConfig()
    expect(config.upstreamUrl).toBe(VALID_UPSTREAM_URL)
    expect(config.panels).toEqual([])
    expect(isGrafanaConfigured(config)).toBe(true)
  })

  it('gives runtime config precedence over the env var', () => {
    setRuntimeConfig({ upstreamUrl: VALID_UPSTREAM_URL, panels: SAMPLE_PANELS })
    restoreEnv()
    restoreEnv = stubEnv(BUILD_TIME_GRAFANA_URL_ENV_VAR, ALT_UPSTREAM_URL)
    const config = loadGrafanaConfig()
    expect(config.upstreamUrl).toBe(VALID_UPSTREAM_URL)
    expect(config.panels).toHaveLength(SAMPLE_PANELS.length)
  })

  it.each([
    ['empty string', ''],
    ['whitespace only', '   '],
    ['tab and newline', '\t\n'],
  ])('treats env var with %s as unset', (_label, value) => {
    restoreEnv()
    restoreEnv = stubEnv(BUILD_TIME_GRAFANA_URL_ENV_VAR, value)
    const config = loadGrafanaConfig()
    expect(config.upstreamUrl).toBeNull()
  })

  it.each([
    ['empty string upstreamUrl', { upstreamUrl: '' }],
    ['whitespace-only upstreamUrl', { upstreamUrl: '   ' }],
    ['missing upstreamUrl key', {}],
    ['null upstreamUrl', { upstreamUrl: null }],
    ['numeric upstreamUrl', { upstreamUrl: 42 }],
    ['undefined global value', undefined],
    ['null global value', null],
  ])('treats runtime config with %s as unset', (_label, value) => {
    if (value !== undefined) {
      setRuntimeConfig(value)
    }
    const config = loadGrafanaConfig()
    expect(config.upstreamUrl).toBeNull()
  })

  it('ignores a runtime global that is an array', () => {
    setRuntimeConfig([VALID_UPSTREAM_URL])
    const config = loadGrafanaConfig()
    expect(config.upstreamUrl).toBeNull()
  })

  it('ignores a runtime global that is a plain string', () => {
    setRuntimeConfig(VALID_UPSTREAM_URL)
    const config = loadGrafanaConfig()
    expect(config.upstreamUrl).toBeNull()
  })

  it('trims whitespace from a valid URL in runtime config', () => {
    setRuntimeConfig({ upstreamUrl: `  ${VALID_UPSTREAM_URL}  `, panels: [] })
    const config = loadGrafanaConfig()
    expect(config.upstreamUrl).toBe(VALID_UPSTREAM_URL)
  })

  it('trims whitespace from a valid env var URL', () => {
    restoreEnv()
    restoreEnv = stubEnv(BUILD_TIME_GRAFANA_URL_ENV_VAR, `  ${VALID_UPSTREAM_URL}  `)
    const config = loadGrafanaConfig()
    expect(config.upstreamUrl).toBe(VALID_UPSTREAM_URL)
  })

  it('returns a frozen config object', () => {
    setRuntimeConfig({ upstreamUrl: VALID_UPSTREAM_URL, panels: SAMPLE_PANELS })
    const config = loadGrafanaConfig()
    expect(Object.isFrozen(config)).toBe(true)
  })

  it('returns a frozen panels array', () => {
    setRuntimeConfig({ upstreamUrl: VALID_UPSTREAM_URL, panels: SAMPLE_PANELS })
    const config = loadGrafanaConfig()
    expect(Object.isFrozen(config.panels)).toBe(true)
  })

  describe('panel parsing', () => {
    it('preserves optional span and height properties when present', () => {
      const panels = [{ title: 'P1', path: '/d-solo/x/y', span: 12, height: 600 }]
      setRuntimeConfig({ upstreamUrl: VALID_UPSTREAM_URL, panels })
      const config = loadGrafanaConfig()
      expect(config.panels[0].span).toBe(12)
      expect(config.panels[0].height).toBe(600)
    })

    it('omits span and height when not provided', () => {
      const panels = [{ title: 'P1', path: '/d-solo/x/y' }]
      setRuntimeConfig({ upstreamUrl: VALID_UPSTREAM_URL, panels })
      const config = loadGrafanaConfig()
      expect(config.panels[0].span).toBeUndefined()
      expect(config.panels[0].height).toBeUndefined()
    })

    it.each([
      ['missing title', { path: '/d-solo/x/y' }],
      ['missing path', { title: 'Foo' }],
      ['null entry', null],
      ['numeric entry', 42],
      ['string entry', 'panel-string'],
      ['title is number', { title: 123, path: '/d-solo/x/y' }],
      ['path is number', { title: 'P', path: 789 }],
    ])('silently drops invalid panel: %s', (_label, badPanel) => {
      setRuntimeConfig({ upstreamUrl: VALID_UPSTREAM_URL, panels: [badPanel] })
      const config = loadGrafanaConfig()
      expect(config.panels).toHaveLength(0)
    })

    it('keeps valid panels and drops invalid ones from a mixed array', () => {
      const panels = [
        { title: 'Valid', path: '/d-solo/x/y' },
        null,
        { title: 'Also Valid', path: '/d-solo/a/b', span: 4 },
        'bad',
        { noTitle: true, path: '/d-solo/c/d' },
      ]
      setRuntimeConfig({ upstreamUrl: VALID_UPSTREAM_URL, panels })
      const config = loadGrafanaConfig()
      expect(config.panels).toHaveLength(2)
      expect(config.panels[0].title).toBe('Valid')
      expect(config.panels[1].title).toBe('Also Valid')
    })

    it('returns empty panels when panels key is not an array', () => {
      setRuntimeConfig({ upstreamUrl: VALID_UPSTREAM_URL, panels: 'not-array' })
      const config = loadGrafanaConfig()
      expect(config.panels).toEqual([])
    })

    it('ignores non-numeric span and height values', () => {
      const panels = [{ title: 'P', path: '/d', span: 'wide', height: 'tall' }]
      setRuntimeConfig({ upstreamUrl: VALID_UPSTREAM_URL, panels })
      const config = loadGrafanaConfig()
      expect(config.panels[0].span).toBeUndefined()
      expect(config.panels[0].height).toBeUndefined()
    })
  })
})

describe('isGrafanaConfigured', () => {
  it.each([
    ['configured', { upstreamUrl: VALID_UPSTREAM_URL, iframeUrl: null, panels: [] } as GrafanaConfig, true],
    ['unconfigured', { upstreamUrl: null, iframeUrl: null, panels: [] } as GrafanaConfig, false],
    [
      'configured with panels',
      { upstreamUrl: VALID_UPSTREAM_URL, iframeUrl: null, panels: SAMPLE_PANELS } as GrafanaConfig,
      true,
    ],
  ])('returns correct boolean for %s config', (_label, config, expected) => {
    expect(isGrafanaConfigured(config)).toBe(expected)
  })
})
