import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { createRuntimeHistory } from './runtime-history'

const TEST = {
  disposed: 'ignores late viewer URL writes after disposal',
  foreign: 'rejects URL writes outside the mounted diagram',
  state: 'preserves browser history metadata and resolves viewer URLs under a deployment base',
} as const

const LOCATION = {
  base: 'https://portfolio.example/base',
  foreign: 'https://unrelated.example/see/diagram',
  hash: '#focus=server',
  page: '/see/diagram',
  query: '?theme=light',
  title: '',
} as const

const STATE = {
  back: '/base/see',
  current: '/base/see/diagram',
  position: 1,
} as const

const createFixture = async () => {
  const href = LOCATION.base + LOCATION.page
  const replaceState = vi.fn()
  vi.stubGlobal('window', {
    history: { replaceState, state: STATE },
    location: new URL(href),
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ component: {}, path: LOCATION.page }],
  })
  await router.push(LOCATION.page)
  return { href, replaceState, router }
}

afterEach(() => void vi.unstubAllGlobals())

test(TEST.state, async () => {
  const { href, replaceState, router } = await createFixture()
  const history = createRuntimeHistory(router, () => false)
  history.replaceState(null, LOCATION.title, href + LOCATION.query + LOCATION.hash)
  expect(replaceState).toHaveBeenCalledWith(STATE, LOCATION.title, STATE.current + LOCATION.query + LOCATION.hash)
  await vi.waitFor(
    () => void expect(router.currentRoute.value.fullPath).toBe(LOCATION.page + LOCATION.query + LOCATION.hash),
  )
})

test(TEST.disposed, async () => {
  const { href, replaceState, router } = await createFixture()
  const history = createRuntimeHistory(router, () => true)
  history.replaceState(null, LOCATION.title, href + LOCATION.hash)
  expect(replaceState).not.toHaveBeenCalled()
})

test(TEST.foreign, async () => {
  const { replaceState, router } = await createFixture()
  const history = createRuntimeHistory(router, () => false)
  history.replaceState(null, LOCATION.title, LOCATION.foreign)
  history.replaceState(null, LOCATION.title, LOCATION.base)
  expect(replaceState).not.toHaveBeenCalled()
})
