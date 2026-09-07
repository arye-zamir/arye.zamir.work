import type { Router } from 'vue-router'

import { parseQuery } from 'vue-router'

import { bindBrowserMember } from './browser-member'

const HISTORY = {
  emptyTitle: '',
  replace: 'replaceState',
} as const

export const createRuntimeHistory = (router: Router, isDisposed: () => boolean): History => {
  const ownerPath = window.location.pathname

  const replaceState: History['replaceState'] = (_data: unknown, _unused: string, url): void => {
    if (isDisposed() || !url || window.location.pathname !== ownerPath) return
    const target = new URL(url, window.location.href)
    if (target.origin !== window.location.origin || target.pathname !== ownerPath) return
    const path = target.pathname + target.search + target.hash
    window.history.replaceState(window.history.state, HISTORY.emptyTitle, path)
    void router.replace({
      hash: target.hash,
      path: router.currentRoute.value.path,
      query: parseQuery(target.search),
    })
  }

  return new Proxy(window.history, {
    get(target, property): unknown {
      if (property === HISTORY.replace) return replaceState
      return bindBrowserMember(target, property)
    },
  })
}
