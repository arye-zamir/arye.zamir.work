import { afterEach, expect, test, vi } from 'vitest'

import { ARCHIFY_CONTRACT } from './archify-contract'
import { resolveInitialAttributes, resolveInitialTheme } from './initial-state'

const TEST = {
  blocked: 'defaults to light when browser storage is unavailable',
  modes: 'applies presentation and embed attributes before runtime mounting',
  query: 'an explicit theme link overrides a saved preference',
  saved: 'a saved preference overrides the light default',
} as const

const QUERY = {
  empty: '',
  light: '?theme=light',
  modes: '?theme=light&present=1&embed=1',
} as const

const STORAGE_ERROR = 'Storage unavailable'

const mockBrowser = (search: string, saved: null | string = null): void => {
  vi.stubGlobal('window', { location: { search }, matchMedia: () => ({ matches: false }) })
  vi.stubGlobal('localStorage', { getItem: () => saved })
}

afterEach(() => void vi.unstubAllGlobals())

test(TEST.query, () => {
  mockBrowser(QUERY.light, ARCHIFY_CONTRACT.theme.dark)
  expect(resolveInitialTheme()).toBe(ARCHIFY_CONTRACT.theme.light)
})

test(TEST.saved, () => {
  mockBrowser(QUERY.empty, ARCHIFY_CONTRACT.theme.dark)
  expect(resolveInitialTheme()).toBe(ARCHIFY_CONTRACT.theme.dark)
})

test(TEST.blocked, () => {
  mockBrowser(QUERY.empty)
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error(STORAGE_ERROR)
    },
  })
  expect(resolveInitialTheme()).toBe(ARCHIFY_CONTRACT.theme.light)
})

test(TEST.modes, () => {
  mockBrowser(QUERY.modes)
  expect(resolveInitialAttributes()).toEqual({
    [ARCHIFY_CONTRACT.attribute.embed]: ARCHIFY_CONTRACT.attribute.enabled,
    [ARCHIFY_CONTRACT.attribute.present]: ARCHIFY_CONTRACT.attribute.enabled,
    [ARCHIFY_CONTRACT.attribute.theme]: ARCHIFY_CONTRACT.theme.light,
  })
})
