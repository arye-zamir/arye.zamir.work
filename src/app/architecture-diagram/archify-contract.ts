export const ARCHIFY_CONTRACT = {
  attribute: {
    embed: 'data-embed',
    enabled: 'true',
    present: 'data-present',
    preset: 'data-preset',
    theme: 'data-theme',
  },
  element: {
    body: 'archify-body',
    component: 'archify-component',
    guidedViewsData: 'archify-guided-views-data',
    i18nData: 'archify-i18n-data',
    root: 'architecture-diagram',
  },
  lightSchemeQuery: '(prefers-color-scheme: light)',
  preset: {
    default: 'classic',
  },
  query: {
    embed: 'embed',
    enabled: '1',
    present: 'present',
    theme: 'theme',
  },
  storage: {
    motion: 'archify-motion',
    theme: 'archify-theme',
  },
  theme: {
    dark: 'dark',
    light: 'light',
  },
} as const
