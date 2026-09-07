<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { I18N_SCOPE, type MessageKey } from '../../internal/i18n'
import { ROUTE_PATH } from '../../internal/router'
import { APP_REGION } from '../accessibility'

const TRANSLATION_KEY = {
  action: 'notFound.action',
  body: 'notFound.body',
  eyebrow: 'notFound.eyebrow',
  title: 'notFound.title',
} as const satisfies Record<string, MessageKey>

const { t } = useI18n({ useScope: I18N_SCOPE.global })
</script>

<template>
  <main :id="APP_REGION.mainId" class="not-found-view" :tabindex="APP_REGION.focusIndex">
    <p class="eyebrow">{{ t(TRANSLATION_KEY.eyebrow) }}</p>
    <h1>{{ t(TRANSLATION_KEY.title) }}</h1>
    <p class="not-found-body">{{ t(TRANSLATION_KEY.body) }}</p>
    <RouterLink class="text-link" :to="ROUTE_PATH.home">{{ t(TRANSLATION_KEY.action) }}</RouterLink>
  </main>
</template>
