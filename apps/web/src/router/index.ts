import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

// Underscore-prefixed routes are reserved actions; everything else is a wiki
// path resolved against the page store (the Wiki.js convention, simplified).
const routes: RouteRecordRaw[] = [
  { path: '/_login', name: 'login', component: () => import('@/views/LoginView.vue') },
  { path: '/_search', name: 'search', component: () => import('@/views/SearchView.vue') },
  { path: '/_new', name: 'new', component: () => import('@/views/PageEdit.vue') },
  {
    path: '/_edit/:path(.*)*',
    name: 'edit',
    component: () => import('@/views/PageEdit.vue'),
  },
  {
    path: '/:path(.*)*',
    name: 'page',
    component: () => import('@/views/PageView.vue'),
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to) {
    if (to.hash) return { el: to.hash, behavior: 'smooth' }
    return { top: 0 }
  },
})

/** Join a vue-router wildcard `:path(.*)*` param into a wiki path string. */
export const paramToPath = (param: unknown): string =>
  Array.isArray(param) ? param.join('/') : String(param ?? '')
