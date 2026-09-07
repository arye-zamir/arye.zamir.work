import type { Router } from 'vue-router'

import { parseQuery } from 'vue-router'

import { browserHistory, browserLocation } from '../../services/browser'
import { bindBrowserMember } from '../../services/browser-member'

const HISTORY = {
  emptyTitle: '',
  replace: 'replaceState',
} as const

export const createRuntimeHistory = (router: Router, isDisposed: () => boolean): History => {
  const ownerPath = browserLocation().pathname

  const replaceState: History['replaceState'] = (_data: unknown, _unused: string, url): void => {
    if (isDisposed() || !url || browserLocation().pathname !== ownerPath) return
    const target = new URL(url, browserLocation().href)
    if (target.origin !== browserLocation().origin || target.pathname !== ownerPath) return
    const path = target.pathname + target.search + target.hash
    browserHistory().replaceState(browserHistory().state, HISTORY.emptyTitle, path)
    void router.replace({
      hash: target.hash,
      path: router.currentRoute.value.path,
      query: parseQuery(target.search),
    })
  }

  return new Proxy(browserHistory(), {
    get(target, property): unknown {
      if (property === HISTORY.replace) return replaceState
      return bindBrowserMember(target, property)
    },
  })
}
