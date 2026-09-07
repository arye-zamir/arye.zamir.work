<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { DIAGRAM } from '../../internal/diagrams'
import { I18N_SCOPE, type MessageKey } from '../../internal/i18n'
import alektionsCover from '../../static/img/1787427367563.jpeg'
import { APP_REGION } from '../accessibility'

const TRANSLATION_KEY = {
  coverAlt: 'diagram.alektions.coverAlt',
  diagramOpen: 'diagram.open',
  eyebrow: 'portfolio.eyebrow',
  introduction: 'portfolio.introduction',
  title: 'portfolio.title',
} as const satisfies Record<string, MessageKey>

const COVER = { height: 1152, width: 2048 } as const

const { t } = useI18n({ useScope: I18N_SCOPE.global })
</script>

<template>
  <main :id="APP_REGION.mainId" class="see-view" :tabindex="APP_REGION.focusIndex">
    <header class="see-header">
      <p class="eyebrow">{{ t(TRANSLATION_KEY.eyebrow) }}</p>
      <h1>{{ t(TRANSLATION_KEY.title) }}</h1>
      <p class="see-introduction">{{ t(TRANSLATION_KEY.introduction) }}</p>
    </header>

    <section class="portfolio-diagram">
      <h2>
        <RouterLink :to="DIAGRAM.alektions.path">{{ t(DIAGRAM.alektions.titleKey) }}</RouterLink>
      </h2>
      <img
        class="portfolio-cover"
        :src="alektionsCover"
        :alt="t(TRANSLATION_KEY.coverAlt)"
        :width="COVER.width"
        :height="COVER.height"
      />
      <p>{{ t(DIAGRAM.alektions.descriptionKey) }}</p>
      <RouterLink class="text-link" :to="DIAGRAM.alektions.path">{{ t(TRANSLATION_KEY.diagramOpen) }}</RouterLink>
    </section>
    <section class="portfolio-diagram">
      <h2>
        <RouterLink :to="DIAGRAM.amiit.path">{{ t(DIAGRAM.amiit.titleKey) }}</RouterLink>
      </h2>
      <p>{{ t(DIAGRAM.amiit.descriptionKey) }}</p>
      <RouterLink class="text-link" :to="DIAGRAM.amiit.path">{{ t(TRANSLATION_KEY.diagramOpen) }}</RouterLink>
    </section>
    <section class="portfolio-diagram">
      <h2>
        <RouterLink :to="DIAGRAM.commodity.path">{{ t(DIAGRAM.commodity.titleKey) }}</RouterLink>
      </h2>
      <p>{{ t(DIAGRAM.commodity.descriptionKey) }}</p>
      <RouterLink class="text-link" :to="DIAGRAM.commodity.path">{{ t(TRANSLATION_KEY.diagramOpen) }}</RouterLink>
    </section>
  </main>
</template>
