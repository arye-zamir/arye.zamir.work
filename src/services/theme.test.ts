import { expect, test, vi } from 'vitest'

import { createStorageService, STORAGE_CAST, STORAGE_KEY, STORAGE_PREFIX, STORAGE_TYPE } from './storage'
import { createThemeService, THEME } from './theme'

const FALLBACK_JSON = 'null'
const TEST = {
  crossTab: 'reads changes and deletion from another tab without rewriting a valid preference',
  defaults: 'creates system as the only persisted theme value',
  invalid: 'repairs an unsupported preference to system',
  legacy: 'ignores the legacy unprefixed theme',
  live: 'follows system changes only while the preference is system',
  toggle: 'cycles all three choices and persists the preference rather than the resolved color',
} as const
const LEGACY = { key: 'archify-theme', value: 'dark' } as const
const INVALID = 'sepia'
const fixture = () => {
  const records = new Map<string, string>()
  let external: ((key: null | string) => void) | undefined
  let changeSystem: (() => void) | undefined
  const stopStorage = vi.fn()
  const stopSystem = vi.fn()
  const storage = createStorageService({
    backend: () => ({
      getItem: (key) => records.get(key) ?? null,
      removeItem: (key) => void records.delete(key),
      setItem: (key, value) => void records.set(key, value),
    }),
    watch: (listener) => {
      external = listener
      return stopStorage
    },
  })
  const prefersDark = vi.fn(() => false)
  const service = createThemeService({
    prefersDark,
    storage,
    watchSystem: (listener) => {
      changeSystem = listener
      return stopSystem
    },
  })
  return {
    changeSystem: () => changeSystem?.(),
    external: () => external?.(STORAGE_PREFIX + STORAGE_KEY.theme),
    prefersDark,
    records,
    service,
    stopStorage,
    stopSystem,
    storage,
  }
}
const key = STORAGE_PREFIX + STORAGE_KEY.theme

test(TEST.defaults, () => {
  const { records, service } = fixture()
  expect(service.snapshot()).toEqual({ preference: THEME.system, resolved: THEME.light })
  expect(JSON.parse(records.get(key) ?? FALLBACK_JSON)).toEqual({ as: STORAGE_CAST.str, val: THEME.system })
  expect(records.size).toBe(1)
})
test(TEST.legacy, () => {
  const { records, service } = fixture()
  records.set(LEGACY.key, LEGACY.value)
  expect(service.getPreference()).toBe(THEME.system)
})
test(TEST.invalid, () => {
  const { service, storage } = fixture()
  storage.set(STORAGE_KEY.theme, INVALID, STORAGE_TYPE.str)
  expect(service.getPreference()).toBe(THEME.system)
  expect(storage.get(STORAGE_KEY.theme)).toBe(THEME.system)
})
test(TEST.toggle, () => {
  const { service, storage } = fixture()
  service.cycle()
  expect(service.getPreference()).toBe(THEME.dark)
  service.cycle()
  expect(service.getPreference()).toBe(THEME.light)
  service.cycle()
  expect(storage.get(STORAGE_KEY.theme)).toBe(THEME.system)
})
test(TEST.live, () => {
  const { changeSystem, prefersDark, service, stopStorage, stopSystem } = fixture()
  const listener = vi.fn()
  const stop = service.subscribe(listener)
  prefersDark.mockReturnValue(true)
  changeSystem()
  expect(listener).toHaveBeenLastCalledWith({ preference: THEME.system, resolved: THEME.dark })
  service.set(THEME.light)
  listener.mockClear()
  prefersDark.mockReturnValue(false)
  changeSystem()
  prefersDark.mockReturnValue(true)
  changeSystem()
  expect(listener).not.toHaveBeenCalled()
  stop()
  expect(stopStorage).toHaveBeenCalledOnce()
  expect(stopSystem).toHaveBeenCalledOnce()
})
test(TEST.crossTab, () => {
  const { external, records, service } = fixture()
  const listener = vi.fn()
  const stop = service.subscribe(listener)
  const raw = JSON.stringify({ val: THEME.dark })
  records.set(key, raw)
  external()
  expect(listener).toHaveBeenLastCalledWith({ preference: THEME.dark, resolved: THEME.dark })
  expect(records.get(key)).toBe(raw)
  records.delete(key)
  external()
  expect(service.getPreference()).toBe(THEME.system)
  stop()
})
