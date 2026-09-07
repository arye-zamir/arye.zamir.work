<script setup lang="ts">
import { LOCALE, type MessageKey } from '../internal/i18n'
import { ROUTE_PATH } from '../internal/router'
import { APP_REGION } from './accessibility'
import { useDocumentContext } from './composables/useDocumentContext'

const TRANSLATION_KEY = {
  english: 'navigation.english',
  englishShort: 'navigation.englishShort',
  hebrew: 'navigation.hebrew',
  hebrewShort: 'navigation.hebrewShort',
  languageLabel: 'navigation.languageLabel',
  primaryLabel: 'navigation.primaryLabel',
  read: 'navigation.read',
  see: 'navigation.see',
  siteName: 'common.siteName',
  skipToContent: 'common.skipToContent',
  versionPrefix: 'common.versionPrefix',
} as const satisfies Record<string, MessageKey>

const { locale, setLocale, t } = useDocumentContext()
</script>

<template>
  <a class="skip-link" :href="APP_REGION.mainHref">{{ t(TRANSLATION_KEY.skipToContent) }}</a>

  <header class="site-header">
    <RouterLink class="site-name" :to="ROUTE_PATH.home">{{ t(TRANSLATION_KEY.siteName) }}</RouterLink>
    <nav :aria-label="t(TRANSLATION_KEY.primaryLabel)">
      <RouterLink :to="ROUTE_PATH.see">{{ t(TRANSLATION_KEY.see) }}</RouterLink>
      <RouterLink :to="ROUTE_PATH.read">{{ t(TRANSLATION_KEY.read) }}</RouterLink>
    </nav>
    <div class="locale-switcher" :aria-label="t(TRANSLATION_KEY.languageLabel)" role="group">
      <button
        type="button"
        :aria-label="t(TRANSLATION_KEY.english)"
        :aria-pressed="locale === LOCALE.en"
        :title="t(TRANSLATION_KEY.english)"
        @click="setLocale(LOCALE.en)"
      >
        {{ t(TRANSLATION_KEY.englishShort) }}
      </button>
      <button
        type="button"
        :aria-label="t(TRANSLATION_KEY.hebrew)"
        :aria-pressed="locale === LOCALE.he"
        :title="t(TRANSLATION_KEY.hebrew)"
        @click="setLocale(LOCALE.he)"
      >
        {{ t(TRANSLATION_KEY.hebrewShort) }}
      </button>
    </div>
  </header>

  <RouterView />

  <footer class="site-footer">
    <span>{{ t(TRANSLATION_KEY.siteName) }}</span>
    <span v-if="$app.version">{{ t(TRANSLATION_KEY.versionPrefix) }}{{ $app.version }}</span>
  </footer>
</template>
