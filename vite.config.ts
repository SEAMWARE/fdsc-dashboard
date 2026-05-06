import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import { fileURLToPath, URL } from 'node:url'

/**
 * Default backend API URLs for local development proxy.
 *
 * In production, the BFF Express server (see server/) serves the SPA and
 * proxies all /api/* requests to downstream services.
 *
 * During local frontend-only development (`npm run dev`), the Vite dev server
 * proxies /api/* requests using one of two modes:
 *
 * 1. **Direct mode (default):** Each /api/<service> path is proxied directly
 *    to a local backend instance. The service prefix is stripped before
 *    forwarding. Override individual targets with VITE_TIL_API_URL, etc.
 *
 * 2. **BFF mode:** Set VITE_BFF_URL (e.g. `http://localhost:3001`) to route
 *    all /api/* requests through a locally running BFF server instead.
 *    The BFF then forwards to downstream services on its own. This is useful
 *    for testing the full proxy chain locally.
 */

/** URL of a locally running BFF server. When set, all /api/* requests are forwarded there. */
const BFF_URL = process.env.VITE_BFF_URL || ''

/** Default target URL for the Trusted Issuers List backend in direct proxy mode. */
const DEFAULT_TIL_URL = 'http://localhost:8080'
/** Default target URL for the Trusted Issuers Registry backend in direct proxy mode. */
const DEFAULT_TIR_URL = 'http://localhost:8081'
/** Default target URL for the Credentials Config Service backend in direct proxy mode. */
const DEFAULT_CCS_URL = 'http://localhost:8082'
/** Default target URL for the ODRL Policy backend in direct proxy mode. */
const DEFAULT_ODRL_URL = 'http://localhost:8083'

/**
 * Default upstream URL for the Apache APISIX Dashboard.
 *
 * Port 9000 is the standard port the Apisix Dashboard Docker image
 * exposes. Override at dev-time via `VITE_APISIX_DASHBOARD_URL`.
 */
const DEFAULT_APISIX_URL = 'http://localhost:9000'

/**
 * Default upstream URL for the Grafana monitoring instance.
 *
 * Port 3100 avoids conflicting with the Vite dev server (port 3000) and
 * with Grafana's own default port (3000) when both run on the host.
 * Override at dev-time via `VITE_GRAFANA_URL`.
 */
const DEFAULT_GRAFANA_URL = 'http://localhost:3100'

/** Maps each downstream service to its VITE_ environment variable name. */
const SERVICE_ENV_VARS = {
  til: 'VITE_TIL_API_URL',
  tir: 'VITE_TIR_API_URL',
  ccs: 'VITE_CCS_API_URL',
  odrl: 'VITE_ODRL_API_URL',
} as const

/**
 * Checks whether a downstream service is enabled for the Vite dev server.
 *
 * A service is disabled only when its VITE_*_API_URL env var is explicitly
 * set to an empty string. When the env var is absent the service uses its
 * default URL and is considered enabled.
 *
 * @param service - Service key (til, tir, ccs, odrl)
 * @returns `true` when the service should be visible and proxied
 */
function isServiceEnabled(service: keyof typeof SERVICE_ENV_VARS): boolean {
  const envVar = SERVICE_ENV_VARS[service]
  return !(envVar in process.env && process.env[envVar] === '')
}

/**
 * Vite plugin that serves `/config.js` dynamically during development,
 * mirroring the BFF's runtime-config endpoint.
 *
 * Injects `window.__SERVICES_CONFIG__` so the frontend can hide navigation
 * tabs and guard routes for unconfigured services. In BFF mode the plugin
 * is a no-op because `/config.js` is proxied to the BFF instead.
 */
function runtimeConfigPlugin(): Plugin {
  return {
    name: 'runtime-config',
    configureServer(server) {
      if (BFF_URL) return

      const servicesJson = JSON.stringify({
        til: isServiceEnabled('til'),
        tir: isServiceEnabled('tir'),
        ccs: isServiceEnabled('ccs'),
        odrl: isServiceEnabled('odrl'),
      })

      const grafanaUrl = process.env.VITE_GRAFANA_URL || ''
      let grafanaPanels: unknown[] = []
      try {
        const parsed = JSON.parse(process.env.VITE_GRAFANA_PANELS_JSON || '[]')
        if (Array.isArray(parsed)) {
          grafanaPanels = parsed
        }
      } catch {
        // Invalid JSON — fall back to empty panels array
      }
      const grafanaJson = JSON.stringify({
        upstreamUrl: grafanaUrl || null,
        panels: grafanaPanels,
      })

      const body = [
        `window.__SERVICES_CONFIG__ = ${servicesJson};`,
        `window.__GRAFANA_CONFIG__ = ${grafanaJson};`,
      ].join('\n')

      server.middlewares.use((req, res, next) => {
        if (req.url !== '/config.js') {
          next()
          return
        }
        res.setHeader('Content-Type', 'application/javascript')
        res.end(body)
      })
    },
  }
}

/**
 * Build the proxy configuration for the Vite dev server.
 *
 * When VITE_BFF_URL is set, a single catch-all proxy forwards every /api/*
 * request to the BFF (preserving the full path so the BFF can route it).
 * `/config.js` is also proxied so the BFF's runtime service configuration
 * reaches the browser.
 *
 * Otherwise, each service gets its own proxy entry that strips the
 * /api/<service> prefix and forwards to a direct backend URL. Services
 * whose VITE_*_API_URL env var is explicitly empty are skipped.
 */
function buildProxyConfig(): Record<string, object> {
  if (BFF_URL) {
    return {
      '/api': {
        target: BFF_URL,
        changeOrigin: true,
      },
      '/config.js': {
        target: BFF_URL,
        changeOrigin: true,
      },
      '/apisix-dashboard': {
        target: BFF_URL,
        changeOrigin: true,
        ws: true,
      },
    }
  }

  const config: Record<string, object> = {}

  if (isServiceEnabled('til')) {
    config['/api/til'] = {
      target: process.env.VITE_TIL_API_URL || DEFAULT_TIL_URL,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api\/til/, ''),
    }
  }
  if (isServiceEnabled('tir')) {
    config['/api/tir'] = {
      target: process.env.VITE_TIR_API_URL || DEFAULT_TIR_URL,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api\/tir/, ''),
    }
  }
  if (isServiceEnabled('ccs')) {
    config['/api/ccs'] = {
      target: process.env.VITE_CCS_API_URL || DEFAULT_CCS_URL,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api\/ccs/, ''),
    }
  }
  if (isServiceEnabled('odrl')) {
    config['/api/odrl'] = {
      target: process.env.VITE_ODRL_API_URL || DEFAULT_ODRL_URL,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api\/odrl/, ''),
    }
  }

  config['/api/grafana'] = {
    target: process.env.VITE_GRAFANA_URL || DEFAULT_GRAFANA_URL,
    changeOrigin: true,
  }

  config['/apisix-dashboard'] = {
    target: process.env.VITE_APISIX_DASHBOARD_URL || DEFAULT_APISIX_URL,
    changeOrigin: true,
    ws: true,
  }

  return config
}

export default defineConfig({
  plugins: [
    runtimeConfigPlugin(),
    vue(),
    vuetify({ autoImport: true }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3000,
    proxy: buildProxyConfig(),
  },
})
