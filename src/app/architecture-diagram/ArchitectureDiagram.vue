<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import type { DiagramDefinition } from './diagram-data'

import { I18N_SCOPE, LOCALE, LOCALE_DIRECTION, type MessageKey } from '../../internal/i18n'
import { ROUTE_PATH } from '../../internal/router'
import { type ArchifyRuntimeSession, createArchifyRuntimeSession } from '../../services/diagram-runtime'
import { ARCHIFY_CONTRACT } from './archify-contract'
import { mountArchifyRuntime } from './archify-runtime'
import { resolveInitialAttributes } from './initial-state'
import { createRuntimeHistory } from './runtime-history'
import './architecture-diagram.css'
import './viewer-layout.css'

const TRANSLATION_KEY = {
  back: 'diagram.back',
  failure: 'diagram.failure',
} as const satisfies Record<string, MessageKey>

const { diagram } = defineProps<{ diagram: DiagramDefinition }>()

const { t } = useI18n({ useScope: I18N_SCOPE.global })
const router = useRouter()
const root = ref<HTMLElement | null>(null)
const body = ref<HTMLElement | null>(null)
const failed = ref(false)
const attributes = resolveInitialAttributes()
let session: ArchifyRuntimeSession | undefined
let disposed = false

onMounted(() => {
  if (!root.value || !body.value) return
  session = createArchifyRuntimeSession(root.value, body.value)
  session.scope.history = createRuntimeHistory(router, () => disposed)
  try {
    mountArchifyRuntime(session.scope)
  } catch {
    session.dispose()
    failed.value = true
  }
})

onBeforeUnmount(() => {
  disposed = true
  session?.dispose()
})
</script>

<template>
  <article
    ref="root"
    v-bind="attributes"
    :class="ARCHIFY_CONTRACT.element.root"
    :lang="LOCALE.en"
    :dir="LOCALE_DIRECTION.en"
    :data-preset="ARCHIFY_CONTRACT.preset.default"
    :data-diagram="diagram.id"
  >
    <header class="viewer-header">
      <RouterLink class="viewer-back" :to="ROUTE_PATH.see">
        <svg class="viewer-back-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M19 12H5m6-6-6 6 6 6" />
        </svg>
        <span>{{ t(TRANSLATION_KEY.back) }}</span>
      </RouterLink>
      <div :class="ARCHIFY_CONTRACT.element.component" v-html="diagram.toolbar" />
    </header>
    <p v-if="failed" class="archify-runtime-failure" role="alert">{{ t(TRANSLATION_KEY.failure) }}</p>
    <div ref="body" :class="ARCHIFY_CONTRACT.element.body" :data-runtime-failed="failed || undefined">
      <div class="container">
        <div :class="ARCHIFY_CONTRACT.element.component" v-html="diagram.header" />
        <div :id="ARCHIFY_CONTRACT.element.guidedViewsData" hidden>{{ diagram.guidedViews }}</div>
        <div :id="ARCHIFY_CONTRACT.element.i18nData" hidden>{{ diagram.i18n }}</div>
        <div :class="ARCHIFY_CONTRACT.element.component" v-html="diagram.guidedControls" />
        <div :class="ARCHIFY_CONTRACT.element.component" v-html="diagram.canvas" />
        <div :class="ARCHIFY_CONTRACT.element.component" v-html="diagram.cards" />
      </div>
    </div>
  </article>
</template>
