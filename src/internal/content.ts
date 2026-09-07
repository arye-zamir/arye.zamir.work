import type { Locale } from './i18n'

export interface AuthoredContent {
  id: string
  original: LocalizedContent
  translations?: Partial<Record<Locale, LocalizedContent>>
}

export interface LocalizedContent {
  body: string
  locale: Locale
  title: string
}

export const contentForLocale = (content: AuthoredContent, locale: Locale): LocalizedContent =>
  content.translations?.[locale] ?? content.original
