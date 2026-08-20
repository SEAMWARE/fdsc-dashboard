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
/* * Copyright 2026 Seamless Middleware Technologies S.L and/or its affiliates * and other
contributors as indicated by the @author tags. * * Licensed under the Apache License, Version 2.0
(the "License"); * you may not use this file except in compliance with the License. * You may obtain
a copy of the License at * * http://www.apache.org/licenses/LICENSE-2.0 * * Unless required by
applicable law or agreed to in writing, software * distributed under the License is distributed on
an "AS IS" BASIS, * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. * See
the License for the specific language governing permissions and * limitations under the License. */

<!--
  Vue wrapper around the `<odrl-policy-editor>` Web Component.

  Binds dashboard-level state (auth token, theme, locale) as HTML attributes
  and re-emits the custom element's Custom Events as standard Vue events so
  consuming views can use `@policy-created`, `@policy-updated`, and
  `@editor-cancelled` with the normal Vue event-handling syntax.
-->

<template>
  <odrl-policy-editor
    ref="editorRef"
    :api-base-url="apiBaseUrl"
    :auth-token="authToken"
    :mode="mode"
    :policy-id="policyId"
    :theme="currentTheme"
    :locale="currentLocale"
    :hide-builder-tab="hideBuilderTab || undefined"
    :hide-raw-tab="hideRawTab || undefined"
    :hide-template-tab="hideTemplateTab || undefined"
    :hide-template-create-tab="hideTemplateCreateTab || undefined"
  />
</template>

<script setup lang="ts">
/**
 * `OdrlPolicyEditor` — reusable Vue 3 wrapper for the
 * `<odrl-policy-editor>` Web Component.
 *
 * The component reactively binds the dashboard's auth token, theme, and
 * locale to the custom element's HTML attributes and re-emits its
 * Custom Events (`policy-created`, `policy-updated`, `editor-cancelled`)
 * as standard Vue events with the `detail` payload unwrapped.
 *
 * Native DOM event listeners are used (via `ref` + `onMounted`) rather than
 * Vue's `v-on` directive because the custom element dispatches native
 * `CustomEvent` objects — not Vue component events — and Vue's template
 * type system cannot infer their payload types.
 *
 * The editor exposes its features as tabs (policy builder, raw ODRL, template
 * selection, template management). Individual tabs can be hidden via the
 * `hide*Tab` props, and a specific tab can be activated on mount via
 * `initialTab` — used, for example, to open the editor directly on template
 * management for a dedicated "Create Template" flow.
 *
 * @example
 * ```vue
 * <OdrlPolicyEditor
 *   mode="edit"
 *   policy-id="urn:example:policy:42"
 *   @policy-created="onCreated"
 *   @policy-updated="onUpdated"
 *   @editor-cancelled="onCancelled"
 * />
 * ```
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { useAuth } from '@/composables/useAuth'
import { useLocale } from '@/composables/useLocale'
import { useTheme } from '@/composables/useTheme'
import type { EditorMode, EmbeddedEventMap } from '@seamware/odrl-policy-editor'

// Side-effect import: registers the <odrl-policy-editor> custom element
import '@seamware/odrl-policy-editor'

/** Default API base URL routed through the BFF proxy. */
const DEFAULT_API_BASE_URL = '/api/odrl'

/** Default editor mode when no explicit mode is provided. */
const DEFAULT_MODE: EditorMode = 'create'

/** Custom event name fired when a new policy is created. */
const EVENT_POLICY_CREATED = 'policy-created'

/** Custom event name fired when an existing policy is updated. */
const EVENT_POLICY_UPDATED = 'policy-updated'

/** Custom event name fired when the user cancels the editor. */
const EVENT_EDITOR_CANCELLED = 'editor-cancelled'

/** Custom event name fired when a new policy template is created. */
const EVENT_TEMPLATE_CREATED = 'template-created'

/** Custom event name fired when an existing policy template is updated. */
const EVENT_TEMPLATE_UPDATED = 'template-updated'

/**
 * Identifier of an editor tab, matching the underlying custom element's
 * internal tab keys. Used with `initialTab` to activate a tab on mount.
 *
 * - `builder` — visual policy builder
 * - `odrl` — raw ODRL JSON editor
 * - `template` — template selection (create mode, when templates exist)
 * - `manage-templates` — template creation / management
 */
export type EditorTab = 'builder' | 'odrl' | 'template' | 'manage-templates'

/**
 * Maximum number of polling attempts while waiting for the custom element's
 * shadow DOM to render its tab bar before activating `initialTab`.
 */
const TAB_ACTIVATION_MAX_ATTEMPTS = 80

/** Delay in milliseconds between tab-activation polling attempts. */
const TAB_ACTIVATION_INTERVAL_MS = 25

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Component props — passed through as HTML attributes to the custom element.
 */
const props = withDefaults(
  defineProps<{
    /**
     * Base URL for all PAP API calls made by the editor.
     * Routed through the BFF proxy by default.
     */
    apiBaseUrl?: string
    /**
     * Operating mode: `'create'` for a new policy, `'edit'` to modify
     * an existing one identified by `policyId`.
     */
    mode?: EditorMode
    /**
     * Policy ID to load when `mode` is `'edit'`.
     * Ignored in create mode.
     */
    policyId?: string | null
    /** When `true`, hides the visual policy builder tab. */
    hideBuilderTab?: boolean
    /** When `true`, hides the raw ODRL JSON editor tab. */
    hideRawTab?: boolean
    /** When `true`, hides the template selection tab. */
    hideTemplateTab?: boolean
    /** When `true`, hides the template creation / management tab. */
    hideTemplateCreateTab?: boolean
    /**
     * Tab to activate once the editor has mounted. When omitted, the editor
     * uses its own default tab selection.
     */
    initialTab?: EditorTab | null
  }>(),
  {
    apiBaseUrl: DEFAULT_API_BASE_URL,
    mode: DEFAULT_MODE,
    policyId: null,
    hideBuilderTab: false,
    hideRawTab: false,
    hideTemplateTab: false,
    hideTemplateCreateTab: false,
    initialTab: null,
  },
)

// ---------------------------------------------------------------------------
// Emits
// ---------------------------------------------------------------------------

/**
 * Events re-emitted from the underlying custom element.
 *
 * Each event carries the `detail` payload from the original `CustomEvent`
 * dispatched by the Web Component.
 */
const emit = defineEmits<{
  /**
   * Fired after the editor successfully creates a new policy.
   *
   * @param payload - Contains the saved `policy` object and its `id`.
   */
  'policy-created': [payload: EmbeddedEventMap['policy-created']]
  /**
   * Fired after the editor successfully updates an existing policy.
   *
   * @param payload - Contains the updated `policy` object and its `id`.
   */
  'policy-updated': [payload: EmbeddedEventMap['policy-updated']]
  /**
   * Fired when the user clicks the Cancel button in the editor.
   *
   * @param payload - Empty object (no detail data).
   */
  'editor-cancelled': [payload: EmbeddedEventMap['editor-cancelled']]
  /**
   * Fired after the editor successfully creates a new policy template
   * via the template management tab.
   *
   * @param payload - Contains the saved `template` object and its `id`.
   */
  'template-created': [payload: EmbeddedEventMap['template-created']]
  /**
   * Fired after the editor successfully updates an existing policy template
   * via the template management tab.
   *
   * @param payload - Contains the updated `template` object and its `id`.
   */
  'template-updated': [payload: EmbeddedEventMap['template-updated']]
}>()

// ---------------------------------------------------------------------------
// Refs
// ---------------------------------------------------------------------------

/** Template ref to the underlying `<odrl-policy-editor>` custom element. */
const editorRef = ref<HTMLElement | null>(null)

// ---------------------------------------------------------------------------
// Reactive dashboard state
// ---------------------------------------------------------------------------

const { token } = useAuth()
const { currentTheme } = useTheme()
const { currentLocale } = useLocale()

/**
 * The current auth token, suitable for the `auth-token` HTML attribute.
 * Returns `null` when the token is empty so the attribute is omitted
 * from the DOM rather than set to an empty string.
 */
const authToken = computed<string | null>(() => token.value || null)

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/**
 * Handle the `policy-created` Custom Event from the web component.
 * Unwraps `event.detail` and re-emits it as a Vue event.
 *
 * @param event - The native DOM event dispatched by the custom element.
 */
function onPolicyCreated(event: Event): void {
  const detail = (event as CustomEvent<EmbeddedEventMap['policy-created']>).detail
  emit(EVENT_POLICY_CREATED, detail)
}

/**
 * Handle the `policy-updated` Custom Event from the web component.
 * Unwraps `event.detail` and re-emits it as a Vue event.
 *
 * @param event - The native DOM event dispatched by the custom element.
 */
function onPolicyUpdated(event: Event): void {
  const detail = (event as CustomEvent<EmbeddedEventMap['policy-updated']>).detail
  emit(EVENT_POLICY_UPDATED, detail)
}

/**
 * Handle the `editor-cancelled` Custom Event from the web component.
 * Unwraps `event.detail` and re-emits it as a Vue event.
 *
 * @param event - The native DOM event dispatched by the custom element.
 */
function onEditorCancelled(event: Event): void {
  const detail = (event as CustomEvent<EmbeddedEventMap['editor-cancelled']>).detail
  emit(EVENT_EDITOR_CANCELLED, detail)
}

/**
 * Handle the `template-created` Custom Event from the web component.
 * Unwraps `event.detail` and re-emits it as a Vue event.
 *
 * @param event - The native DOM event dispatched by the custom element.
 */
function onTemplateCreated(event: Event): void {
  const detail = (event as CustomEvent<EmbeddedEventMap['template-created']>).detail
  emit(EVENT_TEMPLATE_CREATED, detail)
}

/**
 * Handle the `template-updated` Custom Event from the web component.
 * Unwraps `event.detail` and re-emits it as a Vue event.
 *
 * @param event - The native DOM event dispatched by the custom element.
 */
function onTemplateUpdated(event: Event): void {
  const detail = (event as CustomEvent<EmbeddedEventMap['template-updated']>).detail
  emit(EVENT_TEMPLATE_UPDATED, detail)
}

// ---------------------------------------------------------------------------
// Tab activation
// ---------------------------------------------------------------------------

/** Pending tab-activation timer, cleared on unmount. */
let tabActivationTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Activate the editor tab named by `initialTab` once it appears in the
 * custom element's (open) shadow DOM.
 *
 * The underlying element renders its tab bar asynchronously inside a shadow
 * root, and exposes no public API to preselect a tab. Each tab is a button
 * carrying a stable `data-rr-ui-event-key` attribute equal to the tab key,
 * so we poll the shadow root until the target tab is present and then click
 * it. Polling stops after {@link TAB_ACTIVATION_MAX_ATTEMPTS} attempts.
 *
 * @param tab - The tab key to activate.
 * @param attempt - Current polling attempt (used internally for recursion).
 */
function activateTab(tab: EditorTab, attempt = 0): void {
  const link = editorRef.value?.shadowRoot?.querySelector<HTMLElement>(
    `[data-rr-ui-event-key="${tab}"]`,
  )
  if (link) {
    link.click()
    return
  }
  if (attempt >= TAB_ACTIVATION_MAX_ATTEMPTS) return
  tabActivationTimer = setTimeout(
    () => activateTab(tab, attempt + 1),
    TAB_ACTIVATION_INTERVAL_MS,
  )
}

// ---------------------------------------------------------------------------
// Lifecycle — attach / detach native event listeners
// ---------------------------------------------------------------------------

/**
 * Register native DOM event listeners on the custom element after it is
 * mounted. This approach is used instead of Vue's `v-on` directive because
 * the custom element dispatches native `CustomEvent` objects whose
 * `detail` payloads must be unwrapped before re-emitting as Vue events.
 *
 * When `initialTab` is set, the requested tab is activated once the editor's
 * shadow DOM has rendered.
 */
onMounted(() => {
  const el = editorRef.value
  if (!el) return
  el.addEventListener(EVENT_POLICY_CREATED, onPolicyCreated)
  el.addEventListener(EVENT_POLICY_UPDATED, onPolicyUpdated)
  el.addEventListener(EVENT_EDITOR_CANCELLED, onEditorCancelled)
  el.addEventListener(EVENT_TEMPLATE_CREATED, onTemplateCreated)
  el.addEventListener(EVENT_TEMPLATE_UPDATED, onTemplateUpdated)
  if (props.initialTab) activateTab(props.initialTab)
})

/**
 * Remove native DOM event listeners before the component is unmounted
 * to prevent memory leaks.
 */
onBeforeUnmount(() => {
  if (tabActivationTimer !== null) clearTimeout(tabActivationTimer)
  const el = editorRef.value
  if (!el) return
  el.removeEventListener(EVENT_POLICY_CREATED, onPolicyCreated)
  el.removeEventListener(EVENT_POLICY_UPDATED, onPolicyUpdated)
  el.removeEventListener(EVENT_EDITOR_CANCELLED, onEditorCancelled)
  el.removeEventListener(EVENT_TEMPLATE_CREATED, onTemplateCreated)
  el.removeEventListener(EVENT_TEMPLATE_UPDATED, onTemplateUpdated)
})
</script>
