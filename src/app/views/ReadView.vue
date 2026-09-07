<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { I18N_SCOPE, type MessageKey } from '../../internal/i18n'
import { APP_REGION } from '../accessibility'

const TRANSLATION_KEY = {
  emptyBody: 'read.emptyBody',
  emptyTitle: 'read.emptyTitle',
  entryNumber: 'read.entryNumber',
  eyebrow: 'read.eyebrow',
  introduction: 'read.introduction',
  title: 'read.title',
} as const satisfies Record<string, MessageKey>

const { t } = useI18n({ useScope: I18N_SCOPE.global })
</script>

<template>
  <main :id="APP_REGION.mainId" class="read-view" :tabindex="APP_REGION.focusIndex">
    <header class="read-header">
      <p class="eyebrow">{{ t(TRANSLATION_KEY.eyebrow) }}</p>
      <h1>{{ t(TRANSLATION_KEY.title) }}</h1>
      <p class="read-introduction">{{ t(TRANSLATION_KEY.introduction) }}</p>
    </header>

    <section class="journal-empty">
      <span class="journal-mark" aria-hidden="true">{{ t(TRANSLATION_KEY.entryNumber) }}</span>
      <div>
        <h2>{{ t(TRANSLATION_KEY.emptyTitle) }}</h2>
        <p>{{ t(TRANSLATION_KEY.emptyBody) }}</p>
      </div>
    </section>
  </main>
</template>
