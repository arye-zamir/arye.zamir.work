import { createI18n } from 'vue-i18n'

import { browserLanguage } from '../services/browser'

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
      coverAlt: 'Alektions map with clustered events, a selected news item, and the live events feed.',
      description:
        'Explore the architecture of a live election-events map: ingestion, geographic normalization, delivery, and the interactive frontend.',
      title: 'Alektions: Live Election-Events Map',
    },
    amiit: {
      description:
        'An agentic assistant at the center of every interaction, using memory, durable state, and tools for tasks, knowledge, files, and secure credentials.',
      title: 'Amiit.AI: Platform Architecture',
    },
    back: 'Selected work',
    commodity: {
      description:
        'A trading platform integrating the full Amiit.ai assistant stack with a custom trading brain built specifically for trading logic and management.',
      title: 'Multi-Channel Commodity Trading Platform',
    },
    failure: 'The interactive controls could not start. You can still read the diagram below.',
    label: 'Interactive architecture',
    open: 'Explore the architecture',
  },
  home: {
    eyebrow: 'Designer · Builder · Writer',
    introduction:
      'I design and build thoughtful software, with an eye for the systems underneath and the people using them.',
    readLabel: 'Read the journal',
    seeLabel: 'See my work',
    title: 'Arye Zamir',
  },
  metadata: {
    home: {
      description: 'Arye Zamir is a software developer designing resilient, accessible digital products and systems.',
      title: 'Software Developer',
    },
    notFound: {
      description: 'The requested page could not be found.',
      title: 'Page Not Found',
    },
    read: {
      description:
        'Field notes by software developer Arye Zamir on engineering decisions, product craft, and dependable systems.',
      title: 'Writing',
    },
    see: {
      description: 'Selected architecture, product design, and engineering work.',
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
  preferences: { dark: 'Dark', light: 'Light', system: 'System', theme: 'Color theme' },
  read: {
    eyebrow: 'Notes on making software',
    fullPost: 'Full post',
    introduction:
      'Field notes about engineering decisions, product craft, and the work of turning an idea into something dependable.',
    originalLink: 'View the original on LinkedIn',
    postsLabel: 'Journal posts',
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
      coverAlt: 'מפת Alektions עם מקבצי אירועים, ידיעה נבחרת ופיד האירועים בזמן אמת.',
      description: 'ארכיטקטורה של מפת אירועי בחירות בזמן אמת: קליטת מידע, נרמול גאוגרפי, הפצה וממשק משתמש אינטראקטיבי.',
      title: 'עלקציות: מפת אירועי בחירות בזמן אמת',
    },
    amiit: {
      description:
        'עוזר מבוסס סוכן במרכז כל אינטראקציה, עם זיכרון, מצב מתמשך וכלים למשימות, ידע, קבצים ואחסון מאובטח של פרטי גישה.',
      title: 'Amiit.AI: ארכיטקטורת הפלטפורמה',
    },
    back: 'עבודות נבחרות',
    commodity: {
      description:
        'פלטפורמת מסחר המשלבת את מערכת העוזר המלאה של Amiit.ai עם ליבה ייעודית שפותחה במיוחד ללוגיקת המסחר ולניהולו.',
      title: 'פלטפורמה רב ערוצית למסחר בסחורות',
    },
    failure: 'לא ניתן להפעיל את הכלים האינטראקטיביים. אפשר עדיין לקרוא את התרשים למטה.',
    label: 'ארכיטקטורה אינטראקטיבית',
    open: 'לסיור בארכיטקטורה',
  },
  home: {
    eyebrow: 'מעצב · מפתח · כותב',
    introduction: 'אני מעצב ובונה תוכנה מתוך מחשבה, עם תשומת לב למערכות שמתחת לפני השטח ולאנשים שמשתמשים בהן.',
    readLabel: 'לקריאת היומן',
    seeLabel: 'לעבודות שלי',
    title: 'אריה זמיר',
  },
  metadata: {
    home: {
      description: 'אריה זמיר הוא מפתח תוכנה המתכנן מוצרים ומערכות דיגיטליות עמידים ונגישים.',
      title: 'מפתח תוכנה',
    },
    notFound: {
      description: 'לא ניתן למצוא את העמוד המבוקש.',
      title: 'העמוד לא נמצא',
    },
    read: {
      description: 'רשימות מאת מפתח התוכנה אריה זמיר על החלטות הנדסיות, מלאכת המוצר ומערכות אמינות.',
      title: 'כתיבה',
    },
    see: {
      description: 'עבודות נבחרות בארכיטקטורה, עיצוב מוצר והנדסה.',
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
  preferences: { dark: 'כהה', light: 'בהיר', system: 'מערכת', theme: 'ערכת צבעים' },
  read: {
    eyebrow: 'רשימות על יצירת תוכנה',
    fullPost: 'הפוסט המלא',
    introduction: 'רשימות מהשטח על החלטות הנדסיות, מלאכת המוצר והדרך להפוך רעיון למשהו שאפשר לסמוך עליו.',
    originalLink: 'לפוסט המקורי בלינקדאין',
    postsLabel: 'פוסטים',
    title: 'כתיבה',
  },
} satisfies MessageShape<typeof ENGLISH_MESSAGES>

const MESSAGES = {
  [LOCALE.en]: ENGLISH_MESSAGES,
  [LOCALE.he]: HEBREW_MESSAGES,
} as const

export const resolveLocale = (language: string): Locale =>
  language.toLowerCase().startsWith(LOCALE.he) ? LOCALE.he : LOCALE.en

const browserLocale = (): Locale => resolveLocale(browserLanguage())

export const i18n = createI18n({
  fallbackLocale: LOCALE.en,
  legacy: false,
  locale: browserLocale(),
  messages: MESSAGES,
})
