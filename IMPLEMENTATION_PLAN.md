# Implementation Plan: Add odrl-policy-editor to the dashboard

## Overview

Replace the hand-built ODRL policy creation/editing form (`PolicyFormView.vue`, ~650 lines of Vuetify form fields) with the `@seamware/odrl-policy-editor` Web Component from the `odrl-pap` repository. The web component is a React-based editor packaged as a self-contained custom element (`<odrl-policy-editor>`) with Shadow DOM isolation. It makes its own API calls to the PAP backend, so setting `api-base-url="/api/odrl"` routes them through the existing BFF proxy — preserving the current storage path. For service-scoped policies, the `api-base-url` is set dynamically to `/api/odrl/service/{serviceId}`.

## Steps

### Step 1: Install `@seamware/odrl-policy-editor` and configure build tooling

**Goal:** Add the npm dependency and configure Vite + TypeScript so the `<odrl-policy-editor>` custom element is recognized by Vue's template compiler.

**Changes:**

1. **`package.json`** — Add `@seamware/odrl-policy-editor` to `dependencies`:
   ```
   npm install @seamware/odrl-policy-editor
   ```

2. **`vite.config.ts`** — Configure the `vue()` plugin to treat `odrl-policy-editor` as a custom element so Vue does not attempt to resolve it as a Vue component:
   ```ts
   vue({
     template: {
       compilerOptions: {
         isCustomElement: (tag) => tag === 'odrl-policy-editor',
       },
     },
   }),
   ```

3. **`src/custom-elements.d.ts`** (new file) — Add TypeScript declarations for the custom element so `<odrl-policy-editor>` can be used in Vue templates without type errors:
   ```ts
   declare namespace JSX {
     interface IntrinsicElements {
       'odrl-policy-editor': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
         'api-base-url'?: string
         'auth-token'?: string | null
         mode?: 'create' | 'edit'
         'policy-id'?: string
         theme?: 'light' | 'dark'
         locale?: string
         'policy-context'?: string
       }
     }
   }
   ```
   Also add a Vue `HTMLAttributes` augmentation or a module declaration so `vue-tsc` is satisfied.

**Acceptance criteria:**
- `npm install` succeeds and `@seamware/odrl-policy-editor` appears in `node_modules`.
- `npm run build` (which runs `vue-tsc --noEmit && vite build`) passes without errors related to the custom element tag.
- No runtime warnings about "Failed to resolve component: odrl-policy-editor" in the browser console.

---

### Step 2: Create Vue wrapper component for the web component

**Goal:** Create a reusable Vue 3 wrapper (`src/components/OdrlPolicyEditor.vue`) that binds dashboard state (auth token, theme, locale) as HTML attributes and re-emits Custom Events as standard Vue events. This wrapper encapsulates all integration logic so consuming views stay simple.

**Changes:**

1. **`src/components/OdrlPolicyEditor.vue`** (new file) — Create a Vue 3 SFC using `<script setup lang="ts">`:
   - **Props:** `apiBaseUrl` (string, default `'/api/odrl'`), `mode` (`'create' | 'edit'`, default `'create'`), `policyId` (optional string), `policyContext` (optional string).
   - **Reactive bindings from composables:**
     - Auth token from `useAuth()` → `token` computed ref → bound to `auth-token` attribute.
     - Theme from `useTheme()` → `isDark` → compute `'dark' | 'light'` → bound to `theme` attribute.
     - Locale from `useLocale()` → `currentLocale` → bound to `locale` attribute.
   - **Events emitted:** `policy-created`, `policy-updated`, `editor-cancelled` — each unwraps the `CustomEvent.detail` and re-emits.
   - **Side-effect import:** `import '@seamware/odrl-policy-editor'` to register the custom element.
   - **Template:**
     ```vue
     <template>
       <odrl-policy-editor
         :api-base-url="apiBaseUrl"
         :auth-token="authToken"
         :mode="mode"
         :policy-id="policyId"
         :theme="currentTheme"
         :locale="currentLocale"
         :policy-context="policyContext"
         @policy-created="onPolicyCreated"
         @policy-updated="onPolicyUpdated"
         @editor-cancelled="onEditorCancelled"
       />
     </template>
     ```

2. **Documentation:** Add JSDoc to all props, emits, and handler functions following the project's convention.

**Acceptance criteria:**
- The component compiles without TypeScript errors.
- Props are properly typed and documented.
- Events are properly forwarded with their detail payloads.
- Auth token, theme, and locale update reactively when the user changes them in the dashboard.

---

### Step 3: Refactor `PolicyFormView.vue` to use the web component

**Goal:** Replace the ~650-line manual Vuetify form in `PolicyFormView.vue` with the `OdrlPolicyEditor` wrapper component. Wire event handlers to navigate on success or cancellation, preserving the existing routing structure for both global and service-scoped policies.

**Changes:**

1. **`src/views/policies/PolicyFormView.vue`** — Major rewrite:
   - **Remove:** All manual form fields (ODRL context, policy type, UID, permissions builder, constraints builder, JSON preview), form validation logic, and the `buildPayload()` function. Remove unused Vuetify component imports.
   - **Keep:** Back button, page title (`h1`), service badge chip, error/success alerts, route parameter extraction (`id`, `serviceId`), edit-mode detection, and admin-only guard.
   - **Add:** Import and use `OdrlPolicyEditor` component.
   - **Compute `apiBaseUrl` dynamically:**
     - Global policies: `'/api/odrl'`
     - Service-scoped policies: `` `/api/odrl/service/${serviceId}` ``
   - **Compute `mode`:** `'edit'` when route has `id` param, `'create'` otherwise.
   - **Event handlers:**
     - `@policy-created` → Show success snackbar → Navigate to policy detail view (`policy-detail` or `service-policy-detail` route).
     - `@policy-updated` → Show success snackbar → Navigate to policy detail view.
     - `@editor-cancelled` → Navigate back to policy list (`/policies`).
   - **Edit mode loading:** When editing, the web component handles fetching the policy itself via `policy-id` attribute and its own API client — no need for the Pinia store's `fetchPolicyDetail`.

2. **`src/stores/policies.ts`** — No changes needed. The store's `createPolicy`, `updatePolicy`, and service-scoped variants are no longer called from `PolicyFormView`, but they remain available for `PolicyListView` and `PolicyDetailView` (which handle listing, viewing, and deleting).

3. **`src/locales/en.json`** — Review and keep existing i18n keys. The form-specific keys (`policies.odrlContext`, `policies.policyType`, `policies.permissions`, `policies.addPermission`, `policies.constraints`, `policies.addConstraint`, `policies.jsonPreview`, `policies.rawJson`, `policies.validate`) are no longer referenced by `PolicyFormView` but may be kept for backward compatibility or removed as dead code — prefer removal to keep the locale file clean.

4. **`src/router/index.ts`** — No changes needed. All six policy form routes (`policy-create`, `policy-edit`, `service-policy-create`, `service-policy-edit`) continue to point to `PolicyFormView.vue`, which now renders the web component.

**Acceptance criteria:**
- Creating a global policy via `/policies/new` opens the web component editor, and on save navigates to the detail view.
- Editing a global policy via `/policies/:id/edit` opens the web component in edit mode with the correct policy loaded.
- Creating a service-scoped policy via `/policies/service/:serviceId/new` works correctly with the dynamic `api-base-url`.
- Editing a service-scoped policy via `/policies/service/:serviceId/:id/edit` works correctly.
- Cancel button navigates back to the policy list.
- Theme switching (light/dark) is reflected in the web component in real time.
- Auth token is passed and updated reactively.
- The overall page chrome (back button, title, service badge) remains consistent with the rest of the dashboard.

---

### Step 4: Add tests, update linting config, and verify build

**Goal:** Ensure the integration is covered by tests, the build passes cleanly, and linting/formatting are satisfied.

**Changes:**

1. **`src/views/__tests__/PolicyFormView.spec.ts`** (new file) — Add unit tests for the refactored `PolicyFormView`:
   - Test that the `OdrlPolicyEditor` component is rendered with correct props for create mode.
   - Test that edit mode passes `mode="edit"` and the correct `policy-id`.
   - Test that service-scoped routes compute the correct `api-base-url` (e.g., `/api/odrl/service/my-service`).
   - Test that `@policy-created` event triggers navigation to the detail route.
   - Test that `@editor-cancelled` event triggers navigation back to the policy list.
   - Use `@vue/test-utils` `mount`/`shallowMount` with stubbed router and auth store.

2. **`src/components/__tests__/OdrlPolicyEditor.spec.ts`** (new file) — Add unit tests for the wrapper component:
   - Test that props are bound as HTML attributes on the custom element.
   - Test that custom events are re-emitted with the correct payload.
   - Test that auth token, theme, and locale are sourced from their respective composables.

3. **Linting and formatting:**
   - Run `npm run lint` and `npm run format` to ensure all new/modified files comply.
   - If the `@seamware/odrl-policy-editor` package triggers any ESLint import warnings, add it to the appropriate ignore list.

4. **Build verification:**
   - Run `npm run build` (`vue-tsc --noEmit && vite build`) to confirm type-checking and production bundling succeed.
   - Run `npm run test` to confirm all frontend tests pass.
   - Run `cd server && npm test` to confirm BFF tests are unaffected.

**Acceptance criteria:**
- All new tests pass (`npm run test`).
- `npm run build` succeeds without errors.
- `npm run lint` produces no new warnings or errors.
- BFF tests remain green (`cd server && npm test`).
- No console errors or warnings related to the custom element at runtime.
