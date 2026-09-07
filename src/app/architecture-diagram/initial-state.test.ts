import { afterEach, expect, test, vi } from 'vitest'

import * as browser from '../../services/browser'
import { theme, THEME } from '../../services/theme'
import { ARCHIFY_CONTRACT } from './archify-contract'
import { resolveInitialAttributes, resolveInitialTheme } from './initial-state'

const TEST = {
  invalid: 'invalid query themes fall back to the shared preference',
  modes: 'applies presentation and embed attributes before runtime mounting',
  query: 'an explicit theme link changes the view without rewriting the shared preference',
  saved: 'uses the shared preference when no theme override exists',
} as const
const QUERY = {
  base: 'https://portfolio.example/',
  empty: '',
  invalid: '?theme=invalid',
  light: '?theme=light',
  modes: '?theme=light&present=1&embed=1',
} as const
const MEMBER = { location: 'browserLocation', preference: 'getPreference', set: 'set' } as const
const mockBrowser = (search: string): void => {
  vi.spyOn(browser, MEMBER.location).mockReturnValue(new URL(QUERY.base + search))
  vi.spyOn(theme, MEMBER.preference).mockReturnValue(THEME.dark)
}
afterEach(() => void vi.restoreAllMocks())
test(TEST.query, () => {
  mockBrowser(QUERY.light)
  const write = vi.spyOn(theme, MEMBER.set)
  expect(resolveInitialTheme()).toBe(THEME.light)
  expect(write).not.toHaveBeenCalled()
})
test(TEST.saved, () => {
  mockBrowser(QUERY.empty)
  expect(resolveInitialTheme()).toBe(THEME.dark)
})
test(TEST.invalid, () => {
  mockBrowser(QUERY.invalid)
  expect(resolveInitialTheme()).toBe(THEME.dark)
})
test(TEST.modes, () => {
  mockBrowser(QUERY.modes)
  expect(resolveInitialAttributes()).toEqual({
    [ARCHIFY_CONTRACT.attribute.embed]: ARCHIFY_CONTRACT.attribute.enabled,
    [ARCHIFY_CONTRACT.attribute.present]: ARCHIFY_CONTRACT.attribute.enabled,
    [ARCHIFY_CONTRACT.attribute.theme]: THEME.light,
  })
})
