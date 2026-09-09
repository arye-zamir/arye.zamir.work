<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { I18N_SCOPE, type Locale, LOCALE_DIRECTION, type MessageKey } from '../../internal/i18n'
import { SOCIAL_POSTS } from '../../internal/posts'
import { notFoundRoute, ROUTE_PATH } from '../../internal/router'
import { APP_REGION } from '../accessibility'
import { applyPageMetadata } from '../composables/useDocumentContext'
import LanguageFlag from '../LanguageFlag.vue'

const TRANSLATION_KEY = {
  backLabel: 'read.backLabel',
  eyebrow: 'read.eyebrow',
  originalLink: 'read.originalLink',
  siteName: 'common.siteName',
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

const PARAGRAPH_BREAK = /\n\s*\n/u

const route = useRoute()
const router = useRouter()
const { locale, t } = useI18n({ useScope: I18N_SCOPE.global })

const post = computed(() => {
  const source = SOCIAL_POSTS.find(({ id }) => id === route.params.slug)
  if (!source) return undefined

  const activeLocale = locale.value as Locale
  const metadata = source.content.metadata[activeLocale]

  return {
    body: source.content.body.split(PARAGRAPH_BREAK),
    bodyLocale: source.content.locale,
    description: metadata.description,
    direction: LOCALE_DIRECTION[source.content.locale],
    publishedAt: source.publishedAt,
    publishedLabel: new Intl.DateTimeFormat(activeLocale, DATE_FORMAT).format(new Date(source.publishedAt)),
    sourceUrl: source.sourceUrl,
    title: metadata.title,
  }
})

watchEffect(() => {
  if (!post.value) {
    void router.replace(notFoundRoute(route.path))
    return
  }

  applyPageMetadata(post.value.title, t(TRANSLATION_KEY.siteName), post.value.description)
})
</script>

<template>
  <main v-if="post" :id="APP_REGION.mainId" class="post-view" :tabindex="APP_REGION.focusIndex">
    <header class="post-header">
      <p class="eyebrow">{{ t(TRANSLATION_KEY.eyebrow) }}</p>
      <div class="journal-meta">
        <time class="journal-date" :datetime="post.publishedAt">{{ post.publishedLabel }}</time>
        <LanguageFlag :locale="post.bodyLocale" />
      </div>
      <h1>{{ post.title }}</h1>
      <p class="post-lede">{{ post.description }}</p>
    </header>

    <div class="journal-body" :dir="post.direction" :lang="post.bodyLocale">
      <p v-for="paragraph in post.body" :key="paragraph">{{ paragraph }}</p>
    </div>

    <nav class="post-actions">
      <a class="text-link" :href="post.sourceUrl" :rel="EXTERNAL_LINK.rel" :target="EXTERNAL_LINK.target">
        {{ t(TRANSLATION_KEY.originalLink) }}
      </a>
      <RouterLink class="text-link" :to="ROUTE_PATH.read">{{ t(TRANSLATION_KEY.backLabel) }}</RouterLink>
    </nav>
  </main>
</template>
