<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { I18N_SCOPE, type Locale, type MessageKey } from '../../internal/i18n'
import { SOCIAL_POSTS } from '../../internal/posts'
import { readPostPath } from '../../internal/router'
import { APP_REGION } from '../accessibility'
import LanguageFlag from '../LanguageFlag.vue'

const TRANSLATION_KEY = {
  eyebrow: 'read.eyebrow',
  fullPost: 'read.fullPost',
  introduction: 'read.introduction',
  postsLabel: 'read.postsLabel',
  title: 'read.title',
} as const satisfies Record<string, MessageKey>

const DATE_FORMAT = {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
  year: 'numeric',
} as const satisfies Intl.DateTimeFormatOptions

const INDEX_FORMAT = {
  fill: '0',
  offset: 1,
  width: 2,
} as const

const { locale, t } = useI18n({ useScope: I18N_SCOPE.global })

const posts = computed(() => {
  const activeLocale = locale.value as Locale
  const dateFormatter = new Intl.DateTimeFormat(activeLocale, DATE_FORMAT)

  return SOCIAL_POSTS.map((post, index) => {
    const metadata = post.content.metadata[activeLocale]

    return {
      bodyLocale: post.content.locale,
      description: metadata.description,
      id: post.id,
      indexLabel: (index + INDEX_FORMAT.offset).toString().padStart(INDEX_FORMAT.width, INDEX_FORMAT.fill),
      path: readPostPath(post.id),
      publishedAt: post.publishedAt,
      publishedLabel: dateFormatter.format(new Date(post.publishedAt)),
      title: metadata.title,
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
          <div class="journal-meta">
            <time class="journal-date" :datetime="post.publishedAt">{{ post.publishedLabel }}</time>
            <LanguageFlag :locale="post.bodyLocale" />
          </div>
          <h2>
            <RouterLink :to="post.path">{{ post.title }}</RouterLink>
          </h2>
          <p class="journal-description">{{ post.description }}</p>
          <RouterLink class="text-link journal-link" :to="post.path">{{ t(TRANSLATION_KEY.fullPost) }}</RouterLink>
        </div>
      </article>
    </section>
  </main>
</template>
