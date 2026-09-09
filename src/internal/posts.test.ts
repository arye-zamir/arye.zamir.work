import { describe, expect, test } from 'vitest'

import { LOCALE } from './i18n'
import { SOCIAL_POSTS } from './posts'

const TEST = {
  content: 'keeps every post body in its original Hebrew',
  count: 'contains the four selected posts',
  metadata: 'provides a title and short description in every language',
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
      expect(post.content.locale).toBe(LOCALE.he)
      expect(post.content.body.length).toBeGreaterThan(VALUE.minimumTextLength)
    }
  })

  test(TEST.metadata, () => {
    for (const post of SOCIAL_POSTS) {
      for (const locale of Object.values(LOCALE)) {
        const metadata = post.content.metadata[locale]

        expect(metadata.title.length).toBeGreaterThan(VALUE.minimumTextLength)
        expect(metadata.description.length).toBeGreaterThan(VALUE.minimumTextLength)
      }
    }
  })
})
