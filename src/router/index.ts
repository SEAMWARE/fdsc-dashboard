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
import {
  createRouter,
  createWebHistory,
  type NavigationGuardNext,
  type RouteLocationNormalized,
  type RouteRecordRaw,
} from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import {
  CALLBACK_ROUTE_TEMPLATE,
  LOGIN_ROUTE_PATH,
  RETURN_TO_STORAGE_KEY,
} from '@/auth/constants'
import {
  APISIX_DASHBOARD_ROUTE_NAME,
  APISIX_DASHBOARD_ROUTE_PATH,
} from '@/apisix/constants'
import { GRAFANA_ROUTE_NAME, GRAFANA_ROUTE_PATH } from '@/grafana/constants'
import { TRACING_ROUTE_NAME, TRACING_ROUTE_PATH } from '@/tracing/constants'
import { useAuthStore } from '@/stores/auth'
import { useServices, type ServicesConfig } from '@/composables/useServices'

/** Route name of the provider-picker login view. */
const LOGIN_ROUTE_NAME = 'login'

/** Route name of the OAuth2 callback view. */
const CALLBACK_ROUTE_NAME = 'callback'

/**
 * Route names exempt from the authentication guard.
 *
 * The login and callback views must be reachable even when the user is
 * not authenticated, otherwise the guard would create a redirect loop.
 */
const PUBLIC_ROUTE_NAMES: ReadonlySet<string> = new Set([
  LOGIN_ROUTE_NAME,
  CALLBACK_ROUTE_NAME,
])

/** Route `meta` flag requesting admin-only access to the route. */
const ADMIN_ONLY_META = { requiresAdmin: true } as const

/** Application route definitions. */
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: HomeView,
  },
  {
    path: LOGIN_ROUTE_PATH,
    name: LOGIN_ROUTE_NAME,
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: CALLBACK_ROUTE_TEMPLATE,
    name: CALLBACK_ROUTE_NAME,
    component: () => import('@/views/auth/CallbackView.vue'),
    props: true,
    meta: { public: true },
  },
  {
    path: '/til',
    name: 'til-list',
    component: () => import('@/views/til/TilListView.vue'),
  },
  {
    path: '/til/new',
    name: 'til-create',
    component: () => import('@/views/til/TilFormView.vue'),
    meta: { ...ADMIN_ONLY_META },
  },
  {
    path: '/til/:did/edit',
    name: 'til-edit',
    component: () => import('@/views/til/TilFormView.vue'),
    props: true,
    meta: { ...ADMIN_ONLY_META },
  },
  {
    path: '/til/:did',
    name: 'til-detail',
    component: () => import('@/views/til/TilDetailView.vue'),
    props: true,
  },
  {
    path: '/tir',
    name: 'tir-list',
    component: () => import('@/views/tir/TirListView.vue'),
  },
  {
    path: '/tir/:did',
    name: 'tir-detail',
    component: () => import('@/views/tir/TirDetailView.vue'),
    props: true,
  },
  {
    path: '/ccs',
    name: 'ccs-list',
    component: () => import('@/views/ccs/CcsListView.vue'),
  },
  {
    path: '/ccs/new',
    name: 'ccs-create',
    component: () => import('@/views/ccs/CcsFormView.vue'),
    meta: { ...ADMIN_ONLY_META },
  },
  {
    path: '/ccs/:id/edit',
    name: 'ccs-edit',
    component: () => import('@/views/ccs/CcsFormView.vue'),
    props: true,
    meta: { ...ADMIN_ONLY_META },
  },
  {
    path: '/ccs/:id',
    name: 'ccs-detail',
    component: () => import('@/views/ccs/CcsDetailView.vue'),
    props: true,
  },
  {
    path: '/policies',
    name: 'policies-list',
    component: () => import('@/views/policies/PolicyListView.vue'),
  },
  {
    path: '/policies/new',
    name: 'policy-create',
    component: () => import('@/views/policies/PolicyFormView.vue'),
    meta: { ...ADMIN_ONLY_META },
  },
  {
    path: '/policies/:id/edit',
    name: 'policy-edit',
    component: () => import('@/views/policies/PolicyFormView.vue'),
    props: true,
    meta: { ...ADMIN_ONLY_META },
  },
  {
    path: '/policies/:id',
    name: 'policy-detail',
    component: () => import('@/views/policies/PolicyDetailView.vue'),
    props: true,
  },
  {
    path: '/policies/service/:serviceId/new',
    name: 'service-policy-create',
    component: () => import('@/views/policies/PolicyFormView.vue'),
    props: true,
    meta: { ...ADMIN_ONLY_META },
  },
  {
    path: '/policies/service/:serviceId/:id/edit',
    name: 'service-policy-edit',
    component: () => import('@/views/policies/PolicyFormView.vue'),
    props: true,
    meta: { ...ADMIN_ONLY_META },
  },
  {
    path: '/policies/service/:serviceId/:id',
    name: 'service-policy-detail',
    component: () => import('@/views/policies/PolicyDetailView.vue'),
    props: true,
  },
  {
    path: APISIX_DASHBOARD_ROUTE_PATH,
    name: APISIX_DASHBOARD_ROUTE_NAME,
    component: () => import('@/views/apisix/ApisixView.vue'),
    meta: { ...ADMIN_ONLY_META },
  },
  {
    path: GRAFANA_ROUTE_PATH,
    name: GRAFANA_ROUTE_NAME,
    component: () => import('@/views/grafana/GrafanaView.vue'),
  },
  {
    path: TRACING_ROUTE_PATH,
    name: TRACING_ROUTE_NAME,
    component: () => import('@/views/tracing/TracingView.vue'),
    meta: { ...ADMIN_ONLY_META },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

/**
 * Persist the target route so the callback view can redirect the user
 * back to where they were trying to go after authentication completes.
 *
 * Public routes (login / callback) and already-satisfied targets are
 * ignored to avoid overwriting a previously stored value with `/login`.
 *
 * @param target - the route the user was attempting to reach.
 */
function preserveReturnTo(target: RouteLocationNormalized): void {
  if (typeof window === 'undefined') {
    return
  }
  if (typeof target.name === 'string' && PUBLIC_ROUTE_NAMES.has(target.name)) {
    return
  }
  window.sessionStorage.setItem(RETURN_TO_STORAGE_KEY, target.fullPath)
}

/**
 * Determine whether a route is exempt from the authentication guard.
 *
 * @param target - the route being evaluated.
 * @returns `true` when the route may be entered without authentication.
 */
function isPublicRoute(target: RouteLocationNormalized): boolean {
  if (target.meta?.public === true) {
    return true
  }
  return typeof target.name === 'string' && PUBLIC_ROUTE_NAMES.has(target.name)
}

/**
 * Determine whether a route is flagged as admin-only via `meta.requiresAdmin`.
 *
 * @param target - the route being evaluated.
 * @returns `true` when the route requires the `admin` role.
 */
function requiresAdmin(target: RouteLocationNormalized): boolean {
  return target.meta?.requiresAdmin === true
}

/**
 * Resolve the fallback route an authenticated *viewer* should be bounced to
 * when they try to reach an admin-only form. Prefers a sibling list view
 * when the target belongs to a known resource family, otherwise falls back
 * to the dashboard home.
 *
 * @param target - the admin-only route the viewer attempted to visit.
 * @returns the route location to redirect to.
 */
function adminOnlyFallback(
  target: RouteLocationNormalized,
): { name: string } {
  const name = typeof target.name === 'string' ? target.name : ''
  if (name.startsWith('til-')) {
    return { name: 'til-list' }
  }
  if (name.startsWith('tir-')) {
    return { name: 'tir-list' }
  }
  if (name.startsWith('ccs-')) {
    return { name: 'ccs-list' }
  }
  if (name.startsWith('policy-') || name.startsWith('service-policy-')) {
    return { name: 'policies-list' }
  }
  return { name: 'home' }
}

/**
 * Maps a route name prefix to the service key that must be enabled for
 * routes in that family to be reachable.
 */
const ROUTE_SERVICE_MAP: ReadonlyArray<{ prefix: string; service: keyof ServicesConfig }> = [
  { prefix: 'til-', service: 'til' },
  { prefix: 'tir-', service: 'tir' },
  { prefix: 'ccs-', service: 'ccs' },
  { prefix: 'service-policy-', service: 'odrl' },
  { prefix: 'policy-', service: 'odrl' },
  { prefix: 'policies-', service: 'odrl' },
]

/**
 * Resolve the service key required by a given route, if any.
 *
 * @param target - the route being evaluated.
 * @returns The service key, or `null` when the route is not service-specific.
 */
function requiredService(target: RouteLocationNormalized): keyof ServicesConfig | null {
  const name = typeof target.name === 'string' ? target.name : ''
  for (const entry of ROUTE_SERVICE_MAP) {
    if (name.startsWith(entry.prefix)) {
      return entry.service
    }
  }
  return null
}

/**
 * Router-level guard that blocks navigation to routes whose backing
 * service is not configured. Disabled-service routes redirect to home.
 *
 * @param to - the target route.
 * @param _from - the source route (unused).
 * @param next - the navigation callback.
 */
export function serviceGuard(
  to: RouteLocationNormalized,
  _from: RouteLocationNormalized,
  next: NavigationGuardNext,
): void {
  const service = requiredService(to)
  if (service !== null) {
    const services = useServices()
    if (!services[service]) {
      next({ name: 'home' })
      return
    }
  }
  next()
}

/**
 * Router-level authentication guard.
 *
 * When auth is *disabled* the guard is a no-op — this preserves the
 * legacy "no providers configured" behaviour exactly.
 *
 * When auth is *enabled*:
 * - Public routes (`/login`, `/callback/:providerId`) are always allowed.
 * - Admin-only routes (`meta.requiresAdmin`) require the `admin` role;
 *   authenticated viewers are redirected to the matching list view so
 *   they cannot access create / edit screens through direct URLs.
 * - For any other route, an unauthenticated user is redirected to
 *   `/login` with their originally requested path preserved in
 *   `sessionStorage` so the callback view can restore it.
 *
 * @param to - the target route.
 * @param _from - the source route (unused).
 * @param next - the navigation callback.
 */
export function authGuard(
  to: RouteLocationNormalized,
  _from: RouteLocationNormalized,
  next: NavigationGuardNext,
): void {
  const auth = useAuthStore()
  if (!auth.isAuthEnabled) {
    next()
    return
  }
  if (isPublicRoute(to)) {
    next()
    return
  }
  if (!auth.isAuthenticated) {
    preserveReturnTo(to)
    next({ name: LOGIN_ROUTE_NAME })
    return
  }
  if (requiresAdmin(to) && !auth.isAdmin) {
    next(adminOnlyFallback(to))
    return
  }
  next()
}

router.beforeEach(serviceGuard)
router.beforeEach(authGuard)

export default router
