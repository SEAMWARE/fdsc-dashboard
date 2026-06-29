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
 * Runtime configuration endpoint for the BFF server.
 *
 * Serves a `/config.js` JavaScript file that injects auth configuration
 * into the browser's `window` object. This replaces the previous approach
 * of using shell scripts to render config templates at container startup.
 */

import { Router } from 'express'
import {
  type AppConfig,
  getEnabledServices,
  getApisixConfig,
  getGrafanaConfig,
  getTracingConfig,
  getCredentialsConfig,
} from './config.js'

/** Content-Type header value for JavaScript responses. */
const CONTENT_TYPE_JAVASCRIPT = 'application/javascript'

/** HTTP status code for successful responses. */
const HTTP_OK = 200

/**
 * Creates an Express router that serves runtime configuration as JavaScript.
 *
 * `GET /config.js` returns a JavaScript snippet that assigns the auth
 * configuration to `window.__AUTH_CONFIG__`, the per-service availability
 * flags to `window.__SERVICES_CONFIG__`, the Apisix Dashboard
 * configuration to `window.__APISIX_CONFIG__`, the Grafana
 * configuration to `window.__GRAFANA_CONFIG__`, and the tracing
 * configuration to `window.__TRACING_CONFIG__`. The browser loads this
 * script before the SPA boots, making all configs available at runtime
 * without requiring a rebuild.
 *
 * @param config - Application configuration containing auth and service config
 * @returns Express router with the `/config.js` endpoint mounted
 */
export function createRuntimeConfigRouter(config: AppConfig): Router {
  const router = Router()
  const servicesJson = JSON.stringify(getEnabledServices(config))
  const apisixJson = JSON.stringify(getApisixConfig(config))
  const grafanaJson = JSON.stringify(getGrafanaConfig(config))
  const tracingJson = JSON.stringify(getTracingConfig(config))
  const credentialsJson = JSON.stringify(getCredentialsConfig(config))

  router.get('/config.js', (_req, res) => {
    const script = [
      `window.__AUTH_CONFIG__ = ${config.authConfigJson};`,
      `window.__SERVICES_CONFIG__ = ${servicesJson};`,
      `window.__APISIX_CONFIG__ = ${apisixJson};`,
      `window.__GRAFANA_CONFIG__ = ${grafanaJson};`,
      `window.__TRACING_CONFIG__ = ${tracingJson};`,
      `window.__CREDENTIALS_CONFIG__ = ${credentialsJson};`,
    ].join('\n')
    res.status(HTTP_OK).type(CONTENT_TYPE_JAVASCRIPT).send(script)
  })

  return router
}
