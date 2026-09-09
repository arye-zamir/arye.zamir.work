<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { I18N_SCOPE, LOCALE, type Locale, type MessageKey } from '../internal/i18n'

const LANGUAGE_LABEL_KEY = 'read.hebrewContent' as const satisfies MessageKey

defineProps<{ locale: Locale }>()

const { t } = useI18n({ useScope: I18N_SCOPE.global })
</script>

<template>
  <svg
    v-if="locale === LOCALE.he"
    :aria-label="t(LANGUAGE_LABEL_KEY)"
    class="language-flag"
    role="img"
    viewBox="0 0 22 16"
  >
    <title>{{ t(LANGUAGE_LABEL_KEY) }}</title>
    <text
      dominant-baseline="central"
      fill="currentColor"
      font-size="9"
      font-weight="600"
      letter-spacing="0.5"
      text-anchor="middle"
      x="11"
      y="8.5"
    >
      {{ locale.toUpperCase() }}
    </text>
  </svg>
</template>
