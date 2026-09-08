<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { contentForLocale } from '../../internal/content'
import { I18N_SCOPE, type Locale, LOCALE_DIRECTION, type MessageKey } from '../../internal/i18n'
import { SOCIAL_POSTS } from '../../internal/posts'
import { APP_REGION } from '../accessibility'

const TRANSLATION_KEY = {
  eyebrow: 'read.eyebrow',
  fullPost: 'read.fullPost',
  introduction: 'read.introduction',
  originalLink: 'read.originalLink',
  postsLabel: 'read.postsLabel',
  title: 'read.title',
} as const satisfies Record<string, MessageKey>

const DATE_FORMAT = {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
  year: 'numeric',
} as const satisfies Intl.DateTimeFormatOptions

const EXTERNAL_LINK = {
  rel: 'noreferrer',
  target: '_blank',
} as const

const INDEX_FORMAT = {
  fill: '0',
  offset: 1,
  width: 2,
} as const

const PARAGRAPH_BREAK = /\n\s*\n/u

const { locale, t } = useI18n({ useScope: I18N_SCOPE.global })

const posts = computed(() => {
  const activeLocale = locale.value as Locale
  const dateFormatter = new Intl.DateTimeFormat(activeLocale, DATE_FORMAT)

  return SOCIAL_POSTS.map((post, index) => {
    const content = contentForLocale(post, activeLocale)

    return {
      body: content.body.split(PARAGRAPH_BREAK),
      direction: LOCALE_DIRECTION[content.locale],
      id: post.id,
      indexLabel: (index + INDEX_FORMAT.offset).toString().padStart(INDEX_FORMAT.width, INDEX_FORMAT.fill),
      language: content.locale,
      publishedAt: post.publishedAt,
      publishedLabel: dateFormatter.format(new Date(post.publishedAt)),
      sourceUrl: post.sourceUrl,
      title: content.title,
    }
  })
})
</script>

<template>
  <main :id="APP_REGION.mainId" class="read-view" :tabindex="APP_REGION.focusIndex">
    <header class="read-header">
      <p class="eyebrow">{{ t(TRANSLATION_KEY.eyebrow) }}</p>
      <h1>{{ t(TRANSLATION_KEY.title) }}</h1>
      <p class="read-introduction">{{ t(TRANSLATION_KEY.introduction) }}</p>
    </header>

    <section class="journal-list" :aria-label="t(TRANSLATION_KEY.postsLabel)">
      <article v-for="post in posts" :key="post.id" class="journal-entry">
        <span class="journal-mark" aria-hidden="true">{{ post.indexLabel }}</span>
        <div class="journal-entry-content">
          <time class="journal-date" :datetime="post.publishedAt">{{ post.publishedLabel }}</time>
          <h2 :dir="post.direction" :lang="post.language">{{ post.title }}</h2>
          <details class="journal-details">
            <summary>{{ t(TRANSLATION_KEY.fullPost) }}</summary>
            <div class="journal-body" :dir="post.direction" :lang="post.language">
              <p v-for="paragraph in post.body" :key="paragraph">{{ paragraph }}</p>
            </div>
            <a
              class="text-link journal-source"
              :href="post.sourceUrl"
              :rel="EXTERNAL_LINK.rel"
              :target="EXTERNAL_LINK.target"
            >
              {{ t(TRANSLATION_KEY.originalLink) }}
            </a>
          </details>
        </div>
      </article>
    </section>
  </main>
</template>
