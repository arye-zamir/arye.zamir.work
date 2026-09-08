import { describe, expect, test } from 'vitest'

import { contentForLocale } from './content'
import { LOCALE } from './i18n'
import { SOCIAL_POSTS } from './posts'

const TEST = {
  content: 'provides Hebrew content for every post',
  count: 'contains the four selected posts',
  order: 'keeps posts in reverse chronological order',
  suite: 'social posts',
  unique: 'uses unique identifiers and source URLs',
} as const

const VALUE = {
  count: 4,
  minimumTextLength: 4,
} as const

describe(TEST.suite, () => {
  test(TEST.count, () => {
    expect(SOCIAL_POSTS).toHaveLength(VALUE.count)
  })

  test(TEST.order, () => {
    const publishedDates = SOCIAL_POSTS.map(({ publishedAt }) => publishedAt)
    const sortedDates = [...publishedDates].sort((left, right) => right.localeCompare(left))

    expect(publishedDates).toEqual(sortedDates)
  })

  test(TEST.unique, () => {
    const identifiers = new Set(SOCIAL_POSTS.map(({ id }) => id))
    const sourceUrls = new Set(SOCIAL_POSTS.map(({ sourceUrl }) => sourceUrl))

    expect(identifiers.size).toBe(VALUE.count)
    expect(sourceUrls.size).toBe(VALUE.count)
  })

  test(TEST.content, () => {
    for (const post of SOCIAL_POSTS) {
      const content = contentForLocale(post, LOCALE.en)

      expect(content.locale).toBe(LOCALE.he)
      expect(content.body.length).toBeGreaterThan(VALUE.minimumTextLength)
      expect(content.title.length).toBeGreaterThan(VALUE.minimumTextLength)
    }
  })
})
