import { createI18n } from 'vue-i18n'

export const LOCALE = {
  en: 'en',
  he: 'he',
} as const

export type Locale = (typeof LOCALE)[keyof typeof LOCALE]

export const I18N_SCOPE = {
  global: 'global',
} as const

export const LOCALE_DIRECTION = {
  [LOCALE.en]: 'ltr',
  [LOCALE.he]: 'rtl',
} as const

const ENGLISH_MESSAGES = {
  common: {
    siteName: 'Arye Zamir',
    skipToContent: 'Skip to main content',
    versionPrefix: 'v',
  },
  diagram: {
    alektions: {
      description:
        'Explore the architecture of a live election-events map: ingestion, geographic normalization, delivery, and the interactive frontend.',
      title: 'Alektions: Live Election-Events Map',
    },
    back: 'Selected work',
    failure: 'The interactive controls could not start. You can still read the diagram below.',
    label: 'Interactive architecture',
    open: 'Explore the architecture',
  },
  home: {
    eyebrow: 'Frontend Architect · Designer · Builder',
    introduction:
      'I design and build thoughtful software, with an eye for the systems underneath and the people using them.',
    readLabel: 'Read the journal',
    seeLabel: 'See my work',
    title: 'Arye Zamir',
  },
  metadata: {
    home: {
      description: 'Arye Zamir is a frontend architect designing resilient, accessible digital products and systems.',
      title: 'Frontend Architect',
    },
    notFound: {
      description: 'The requested page could not be found.',
      title: 'Page Not Found',
    },
    read: {
      description:
        'Field notes by frontend architect Arye Zamir on engineering decisions, product craft, and dependable systems.',
      title: 'Writing',
    },
    see: {
      description: 'Selected frontend architecture, product design, and engineering work by Arye Zamir.',
      title: 'Selected Work',
    },
  },
  navigation: {
    english: 'English',
    englishShort: 'EN',
    hebrew: 'עברית',
    hebrewShort: 'עב',
    languageLabel: 'Language',
    primaryLabel: 'Primary navigation',
    read: 'Read',
    see: 'See',
  },
  notFound: {
    action: 'Return home',
    body: 'This route does not exist or has moved.',
    eyebrow: '404 · Route not found',
    title: 'Off the map.',
  },
  portfolio: {
    eyebrow: 'Selected work',
    indexLabel: '01 / arye.zamir.work',
    introduction: 'A portfolio of digital products, technical systems, and the decisions that made them hold together.',
    statusLabel: 'Production system',
    title: 'See',
  },
  read: {
    emptyBody: 'New writing will appear here soon.',
    emptyTitle: 'The first essay is in progress.',
    entryNumber: '01',
    eyebrow: 'Notes on making software',
    introduction:
      'Field notes about engineering decisions, product craft, and the work of turning an idea into something dependable.',
    title: 'Read',
  },
} as const

export type MessageKey = MessageKeyFor<typeof ENGLISH_MESSAGES>

type MessageKeyFor<Source> = {
  [Key in keyof Source & string]: Source[Key] extends string ? Key : `${Key}.${MessageKeyFor<Source[Key]>}`
}[keyof Source & string]

type MessageShape<Source> = {
  [Key in keyof Source]: Source[Key] extends string ? string : MessageShape<Source[Key]>
}

const HEBREW_MESSAGES = {
  common: {
    siteName: 'אריה זמיר',
    skipToContent: 'דילוג לתוכן הראשי',
    versionPrefix: 'גרסה ',
  },
  diagram: {
    alektions: {
      description: 'ארכיטקטורה של מפת אירועי בחירות בזמן אמת: קליטת מידע, נרמול גאוגרפי, הפצה וממשק משתמש אינטראקטיבי.',
      title: 'Alektions: מפת אירועי בחירות בזמן אמת',
    },
    back: 'עבודות נבחרות',
    failure: 'לא ניתן להפעיל את הכלים האינטראקטיביים. אפשר עדיין לקרוא את התרשים למטה.',
    label: 'ארכיטקטורה אינטראקטיבית',
    open: 'לסיור בארכיטקטורה',
  },
  home: {
    eyebrow: 'ארכיטקט פרונטאנד · מעצב · בונה',
    introduction: 'אני מעצב ובונה תוכנה מתוך מחשבה, עם תשומת לב למערכות שמתחת לפני השטח ולאנשים שמשתמשים בהן.',
    readLabel: 'לקריאת היומן',
    seeLabel: 'לעבודות שלי',
    title: 'אריה זמיר',
  },
  metadata: {
    home: {
      description: 'אריה זמיר הוא ארכיטקט פרונטאנד המתכנן מוצרים ומערכות דיגיטליות עמידים ונגישים.',
      title: 'ארכיטקט פרונטאנד',
    },
    notFound: {
      description: 'לא ניתן למצוא את העמוד המבוקש.',
      title: 'העמוד לא נמצא',
    },
    read: {
      description: 'רשימות מאת ארכיטקט הפרונטאנד אריה זמיר על החלטות הנדסיות, מלאכת המוצר ומערכות אמינות.',
      title: 'כתיבה',
    },
    see: {
      description: 'עבודות נבחרות בארכיטקטורת פרונטאנד, עיצוב מוצר והנדסה מאת אריה זמיר.',
      title: 'עבודות נבחרות',
    },
  },
  navigation: {
    english: 'English',
    englishShort: 'EN',
    hebrew: 'עברית',
    hebrewShort: 'עב',
    languageLabel: 'שפה',
    primaryLabel: 'ניווט ראשי',
    read: 'כתיבה',
    see: 'עבודות',
  },
  notFound: {
    action: 'חזרה לעמוד הבית',
    body: 'העמוד הזה לא קיים או שהועבר למקום אחר.',
    eyebrow: '404 · העמוד לא נמצא',
    title: 'מחוץ למפה.',
  },
  portfolio: {
    eyebrow: 'עבודות נבחרות',
    indexLabel: '01 / arye.zamir.work',
    introduction: 'תיק עבודות של מוצרים דיגיטליים, מערכות טכנולוגיות וההחלטות שמחזיקות אותם יחד.',
    statusLabel: 'מערכת בפרודקשן',
    title: 'עבודות',
  },
  read: {
    emptyBody: 'כתיבה חדשה תופיע כאן בקרוב.',
    emptyTitle: 'המאמר הראשון בתהליך כתיבה.',
    entryNumber: '01',
    eyebrow: 'רשימות על יצירת תוכנה',
    introduction: 'רשימות מהשטח על החלטות הנדסיות, מלאכת המוצר והדרך להפוך רעיון למשהו שאפשר לסמוך עליו.',
    title: 'כתיבה',
  },
} satisfies MessageShape<typeof ENGLISH_MESSAGES>

const MESSAGES = {
  [LOCALE.en]: ENGLISH_MESSAGES,
  [LOCALE.he]: HEBREW_MESSAGES,
} as const

export const resolveLocale = (language: string): Locale =>
  language.toLowerCase().startsWith(LOCALE.he) ? LOCALE.he : LOCALE.en

const browserLocale = (): Locale => resolveLocale(navigator.language)

export const i18n = createI18n({
  fallbackLocale: LOCALE.en,
  legacy: false,
  locale: browserLocale(),
  messages: MESSAGES,
})
