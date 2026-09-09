import { nextTick, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import { I18N_SCOPE, type Locale, LOCALE_DIRECTION, type MessageKey } from '../../internal/i18n'
import { APP_REGION } from '../accessibility'

const DOCUMENT = {
  descriptionSelector: 'meta[name="description"]',
  headingSelector: `#${APP_REGION.mainId} h1`,
  siteNameKey: 'common.siteName' satisfies MessageKey,
  titleSeparator: ' | ',
} as const

export const applyPageMetadata = (title: string, siteName: string, description: string): void => {
  document.title = `${title}${DOCUMENT.titleSeparator}${siteName}`
  document.querySelector<HTMLMetaElement>(DOCUMENT.descriptionSelector)?.setAttribute('content', description)
}

export const useDocumentContext = () => {
  const route = useRoute()
  const { locale, t } = useI18n({ useScope: I18N_SCOPE.global })

  const setLocale = (nextLocale: Locale): void => {
    locale.value = nextLocale
  }

  watchEffect(() => {
    const activeLocale = locale.value as Locale
    const { descriptionKey, titleKey } = route.meta

    document.documentElement.lang = activeLocale
    document.documentElement.dir = LOCALE_DIRECTION[activeLocale]
    if (!descriptionKey || !titleKey) return

    applyPageMetadata(t(titleKey), t(DOCUMENT.siteNameKey), t(descriptionKey))
  })

  watch(
    () => route.path,
    async () => {
      await nextTick()
      const heading = document.querySelector<HTMLElement>(DOCUMENT.headingSelector)
      heading?.setAttribute('tabindex', APP_REGION.focusIndex.toString())
      heading?.focus()
    },
  )

  return { locale, setLocale, t }
}
