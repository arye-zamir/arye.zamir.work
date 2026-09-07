import { describe, expect, test } from 'vitest'

import { type AuthoredContent, contentForLocale, type LocalizedContent } from './content'
import { LOCALE } from './i18n'

const COPY = {
  englishBody: 'An English original.',
  englishTitle: 'Architecture notes',
  hebrewBody: 'תרגום לעברית.',
  hebrewTitle: 'רשימות ארכיטקטורה',
  id: 'architecture-notes',
} as const

const TEST = {
  original: 'returns the canonical original when a translation is unavailable',
  suite: 'contentForLocale',
  translation: 'returns the requested translation when it exists',
} as const

const ORIGINAL: LocalizedContent = {
  body: COPY.englishBody,
  locale: LOCALE.en,
  title: COPY.englishTitle,
}

const HEBREW_TRANSLATION: LocalizedContent = {
  body: COPY.hebrewBody,
  locale: LOCALE.he,
  title: COPY.hebrewTitle,
}

const CONTENT: AuthoredContent = {
  id: COPY.id,
  original: ORIGINAL,
  translations: {
    [LOCALE.he]: HEBREW_TRANSLATION,
  },
}

describe(TEST.suite, () => {
  test(TEST.translation, () => {
    expect(contentForLocale(CONTENT, LOCALE.he)).toBe(HEBREW_TRANSLATION)
  })

  test(TEST.original, () => {
    expect(contentForLocale(CONTENT, LOCALE.en)).toBe(ORIGINAL)
  })
})
