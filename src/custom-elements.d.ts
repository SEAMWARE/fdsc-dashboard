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
 * Type declarations for third-party Custom Elements used in Vue templates.
 *
 * When a tag is listed in the `isCustomElement` compiler option
 * (see `vite.config.ts`), Vue treats it as a native Custom Element and
 * skips component resolution. This module augments Vue's `GlobalComponents`
 * interface so that `vue-tsc` can still validate the element's attributes
 * in `<template>` blocks.
 *
 * @see {@link https://vuejs.org/guide/extras/web-components.html}
 */

import type { DefineComponent } from 'vue'
import type {
  EditorMode,
  EmbeddedThemePreset,
} from '@seamware/odrl-policy-editor'

/**
 * HTML attributes accepted by the `<odrl-policy-editor>` custom element.
 *
 * These map 1:1 to the observed attributes listed in the upstream package's
 * `OdrlPolicyEditorElement` class declaration.
 */
export interface OdrlPolicyEditorAttributes {
  /** Base URL for all PAP API calls (e.g. `"/api/odrl"`). */
  'api-base-url'?: string
  /** Bearer token for API authentication. */
  'auth-token'?: string | null
  /** Whether to create a new policy or edit an existing one. */
  mode?: EditorMode
  /** Policy ID to load when `mode` is `"edit"`. */
  'policy-id'?: string | null
  /** Theme preset: `"light"` or `"dark"`. */
  theme?: EmbeddedThemePreset
  /** Language code (e.g. `"en"`, `"de"`). */
  locale?: string
  /** JSON-LD `@context` for new policies (serialised as JSON string). */
  'policy-context'?: string | null
}

declare module 'vue' {
  /**
   * Augment Vue's component registry so `vue-tsc` recognises the
   * `<odrl-policy-editor>` tag and type-checks its attributes.
   */
  interface GlobalComponents {
    'odrl-policy-editor': DefineComponent<OdrlPolicyEditorAttributes>
  }
}
