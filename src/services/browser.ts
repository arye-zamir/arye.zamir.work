import { createStorageService } from './storage'

const BROWSER = {
  change: 'change',
  darkQuery: '(prefers-color-scheme: dark)',
  fallbackLanguage: 'en',
  fallbackUrl: 'http://localhost/',
  storage: 'storage',
  unavailable: 'Browser environment unavailable',
} as const
type Browser = typeof globalThis & Window
const browser = (): Browser | undefined => (typeof window === 'undefined' ? undefined : window)

export const browserLanguage = (): string => browser()?.navigator.language ?? BROWSER.fallbackLanguage
export const browserLocation = (): URL => new URL(browser()?.location.href ?? BROWSER.fallbackUrl)
export const browserPrefersDark = (): boolean => browser()?.matchMedia(BROWSER.darkQuery).matches ?? false
export const watchSystemTheme = (listener: () => void): (() => void) => {
  const query = browser()?.matchMedia(BROWSER.darkQuery)
  query?.addEventListener(BROWSER.change, listener)
  return () => void query?.removeEventListener(BROWSER.change, listener)
}
export const requireBrowser = (): Browser => {
  const value = browser()
  if (!value) throw new Error(BROWSER.unavailable)
  return value
}
export const storage = createStorageService({
  backend: () => browser()?.localStorage,
  watch: (listener) => {
    const target = browser()
    const onStorage = (event: StorageEvent): void => {
      try {
        if (event.storageArea !== target?.localStorage) return
        listener(event.key)
      } catch {
        return
      }
    }
    target?.addEventListener(BROWSER.storage, onStorage)
    return () => void target?.removeEventListener(BROWSER.storage, onStorage)
  },
})

export const browserHistory = (): History => requireBrowser().history
