<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { contentForLocale } from '../../internal/content'
import { I18N_SCOPE, type MessageKey, resolveLocale } from '../../internal/i18n'
import { APP_REGION } from '../accessibility'
import { FEATURED_PROJECT } from '../content/projects'

const TRANSLATION_KEY = {
  eyebrow: 'portfolio.eyebrow',
  indexLabel: 'portfolio.indexLabel',
  introduction: 'portfolio.introduction',
  statusLabel: 'portfolio.statusLabel',
  title: 'portfolio.title',
} as const satisfies Record<string, MessageKey>

const { locale, t } = useI18n({ useScope: I18N_SCOPE.global })
const project = computed(() => contentForLocale(FEATURED_PROJECT, resolveLocale(locale.value)))
</script>

<template>
  <main :id="APP_REGION.mainId" class="see-view" :tabindex="APP_REGION.focusIndex">
    <header class="see-header">
      <p class="eyebrow">{{ t(TRANSLATION_KEY.eyebrow) }}</p>
      <h1>{{ t(TRANSLATION_KEY.title) }}</h1>
      <p class="see-introduction">{{ t(TRANSLATION_KEY.introduction) }}</p>
    </header>

    <section class="portfolio-stage">
      <div class="portfolio-visual" aria-hidden="true">
        <span class="portfolio-plane portfolio-plane-primary" />
        <span class="portfolio-plane portfolio-plane-secondary" />
        <span class="portfolio-axis" />
      </div>

      <div class="portfolio-copy">
        <div class="portfolio-meta">
          <span>{{ t(TRANSLATION_KEY.indexLabel) }}</span>
          <span>{{ t(TRANSLATION_KEY.statusLabel) }}</span>
        </div>
        <h2>{{ project.title }}</h2>
        <p>{{ project.body }}</p>
      </div>
    </section>
  </main>
</template>
