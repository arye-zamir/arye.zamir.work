const EMPTY_VERSION = ''

export const APP = {
  version: import.meta.env.VITE_APP_VERSION ?? EMPTY_VERSION,
} as const

declare module 'vue' {
  interface ComponentCustomProperties {
    $app: typeof APP
  }
}
