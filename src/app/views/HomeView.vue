<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { I18N_SCOPE, type MessageKey } from '../../internal/i18n'
import { ROUTE_PATH } from '../../internal/router'
import { APP_REGION } from '../accessibility'

const TRANSLATION_KEY = {
  eyebrow: 'home.eyebrow',
  introduction: 'home.introduction',
  readLabel: 'home.readLabel',
  seeLabel: 'home.seeLabel',
  title: 'home.title',
} as const satisfies Record<string, MessageKey>

const { t } = useI18n({ useScope: I18N_SCOPE.global })
</script>

<template>
  <main :id="APP_REGION.mainId" class="home-view" :tabindex="APP_REGION.focusIndex">
    <p class="eyebrow" data-factt="home-eyebrow">{{ t(TRANSLATION_KEY.eyebrow) }}</p>
    <h1>{{ t(TRANSLATION_KEY.title) }}</h1>
    <p class="home-introduction">{{ t(TRANSLATION_KEY.introduction) }}</p>
    <nav class="home-actions">
      <RouterLink class="text-link text-link-read" :to="ROUTE_PATH.read">{{ t(TRANSLATION_KEY.readLabel) }}</RouterLink>
      <RouterLink class="text-link text-link-see" :to="ROUTE_PATH.see">{{ t(TRANSLATION_KEY.seeLabel) }}</RouterLink>
    </nav>
  </main>
</template>
