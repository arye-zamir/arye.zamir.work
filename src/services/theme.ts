import { browserPrefersDark, storage, watchSystemTheme } from './browser'
import { STORAGE_CAST, STORAGE_KEY, type StorageService, type StorageType } from './storage'

export const THEME = { dark: 'dark', light: 'light', system: 'system' } as const
export type ResolvedTheme = Exclude<ThemePreference, typeof THEME.system>
export type ThemePreference = (typeof THEME)[keyof typeof THEME]
export interface ThemeSnapshot {
  preference: ThemePreference
  resolved: ResolvedTheme
}
interface ThemeDependencies {
  prefersDark: () => boolean
  storage: StorageService
  watchSystem: (listener: () => void) => () => void
}
const NEXT_THEME = { [THEME.dark]: THEME.light, [THEME.light]: THEME.system, [THEME.system]: THEME.dark } as const
const ERROR = 'Invalid theme preference'
export const isThemePreference = (value: unknown): value is ThemePreference =>
  Object.values(THEME).some((theme) => theme === value)

export const THEME_TYPE = { as: STORAGE_CAST.str, is: isThemePreference } satisfies StorageType<ThemePreference>

export const createThemeService = ({ prefersDark, storage, watchSystem }: ThemeDependencies) => {
  const getPreference = (): ThemePreference =>
    storage.getOrCreate<ThemePreference>(STORAGE_KEY.theme, THEME.system, THEME_TYPE)
  const resolve = (preference: ThemePreference): ResolvedTheme =>
    preference === THEME.system ? (prefersDark() ? THEME.dark : THEME.light) : preference
  const snapshot = (): ThemeSnapshot => {
    const preference = getPreference()
    return { preference, resolved: resolve(preference) }
  }
  const set = (preference: ThemePreference): boolean => {
    if (!isThemePreference(preference)) throw new TypeError(ERROR)
    return storage.set<ThemePreference>(STORAGE_KEY.theme, preference, THEME_TYPE)
  }
  const cycle = (): boolean => set(NEXT_THEME[getPreference()])
  const subscribe = (listener: (value: ThemeSnapshot) => void): (() => void) => {
    let previous = snapshot()
    const notify = (force = false): void => {
      const current = snapshot()
      if (!force && current.preference === previous.preference && current.resolved === previous.resolved) return
      previous = current
      listener(current)
    }
    const stopStorage = storage.subscribe((key) => {
      if (key === null || key === STORAGE_KEY.theme) notify(true)
    })
    const stopSystem = watchSystem(() => void notify())
    listener(previous)
    return () => {
      stopStorage()
      stopSystem()
    }
  }
  return { cycle, getPreference, resolve, set, snapshot, subscribe }
}
export const theme = createThemeService({ prefersDark: browserPrefersDark, storage, watchSystem: watchSystemTheme })
