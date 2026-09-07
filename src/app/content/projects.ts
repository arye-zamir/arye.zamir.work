import type { AuthoredContent } from '../../internal/content'

import { LOCALE } from '../../internal/i18n'

export const FEATURED_PROJECT = {
  id: 'portfolio-platform',
  original: {
    body: 'A typed Vue 3 platform with route-level code splitting, bidirectional localization, synchronized metadata, keyboard focus management, and automated quality gates.',
    locale: LOCALE.en,
    title: 'A bilingual portfolio system',
  },
  translations: {
    [LOCALE.he]: {
      body: 'פלטפורמת Vue 3 מוקלדת עם פיצול קוד לפי נתיבים, לוקליזציה דו-כיוונית, מטא-דאטה מסונכרן, ניהול מיקוד למקלדת ושערי איכות אוטומטיים.',
      locale: LOCALE.he,
      title: 'מערכת תיק עבודות דו-לשונית',
    },
  },
} satisfies AuthoredContent
