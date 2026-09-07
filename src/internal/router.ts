import { createRouter, createWebHistory } from 'vue-router'

import type { MessageKey } from './i18n'

import { DIAGRAM } from './diagrams'

declare module 'vue-router' {
  interface RouteMeta {
    descriptionKey?: MessageKey
    titleKey?: MessageKey
  }
}

export const ROUTE_PATH = {
  home: '/',
  notFound: '/:pathMatch(.*)*',
  read: '/read',
  see: '/see',
} as const

const ROUTE_NAME = {
  diagram: 'diagram',
  home: 'home',
  notFound: 'not-found',
  read: 'read',
  see: 'see',
} as const

const ROUTE_META = {
  home: {
    descriptionKey: 'metadata.home.description',
    titleKey: 'metadata.home.title',
  },
  notFound: {
    descriptionKey: 'metadata.notFound.description',
    titleKey: 'metadata.notFound.title',
  },
  read: {
    descriptionKey: 'metadata.read.description',
    titleKey: 'metadata.read.title',
  },
  see: {
    descriptionKey: 'metadata.see.description',
    titleKey: 'metadata.see.title',
  },
} as const

const SCROLL_POSITION = {
  top: 0,
} as const

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      component: () => import('../app/views/DiagramView.vue'),
      meta: {
        descriptionKey: DIAGRAM.alektions.descriptionKey,
        titleKey: DIAGRAM.alektions.titleKey,
      },
      name: ROUTE_NAME.diagram,
      path: DIAGRAM.alektions.path,
    },
    {
      component: () => import('../app/views/HomeView.vue'),
      meta: ROUTE_META.home,
      name: ROUTE_NAME.home,
      path: ROUTE_PATH.home,
    },
    {
      component: () => import('../app/views/ReadView.vue'),
      meta: ROUTE_META.read,
      name: ROUTE_NAME.read,
      path: ROUTE_PATH.read,
    },
    {
      component: () => import('../app/views/SeeView.vue'),
      meta: ROUTE_META.see,
      name: ROUTE_NAME.see,
      path: ROUTE_PATH.see,
    },
    {
      component: () => import('../app/views/NotFoundView.vue'),
      meta: ROUTE_META.notFound,
      name: ROUTE_NAME.notFound,
      path: ROUTE_PATH.notFound,
    },
  ],
  scrollBehavior: (to, from, savedPosition) => savedPosition ?? (to.path === from.path ? false : SCROLL_POSITION),
})
