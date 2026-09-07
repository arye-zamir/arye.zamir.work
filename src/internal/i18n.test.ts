import { describe, expect, test } from 'vitest'

import { LOCALE, resolveLocale } from './i18n'

const LANGUAGE = {
  english: 'en-US',
  hebrew: 'he-IL',
  unsupported: 'fr-FR',
} as const

const TEST = {
  english: 'selects English for an English browser locale',
  fallback: 'falls back to English for an unsupported browser locale',
  hebrew: 'selects Hebrew for a regional Hebrew browser locale',
  suite: 'resolveLocale',
} as const

describe(TEST.suite, () => {
  test(TEST.english, () => {
    expect(resolveLocale(LANGUAGE.english)).toBe(LOCALE.en)
  })

  test(TEST.hebrew, () => {
    expect(resolveLocale(LANGUAGE.hebrew)).toBe(LOCALE.he)
  })

  test(TEST.fallback, () => {
    expect(resolveLocale(LANGUAGE.unsupported)).toBe(LOCALE.en)
  })
})
