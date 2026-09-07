import { ARCHIFY_CONTRACT } from './archify-contract'

type DiagramTheme = (typeof ARCHIFY_CONTRACT.theme)[keyof typeof ARCHIFY_CONTRACT.theme]

const isTheme = (value: unknown): value is DiagramTheme =>
  value === ARCHIFY_CONTRACT.theme.dark || value === ARCHIFY_CONTRACT.theme.light

export const readStoredTheme = (): DiagramTheme | null => {
  try {
    const value = localStorage.getItem(ARCHIFY_CONTRACT.storage.theme)
    return isTheme(value) ? value : null
  } catch {
    return null
  }
}

export const readThemeOverride = (): DiagramTheme | null => {
  const value = new URLSearchParams(window.location.search).get(ARCHIFY_CONTRACT.query.theme)
  return isTheme(value) ? value : null
}

export const resolveInitialTheme = (): DiagramTheme =>
  readThemeOverride() ?? readStoredTheme() ?? ARCHIFY_CONTRACT.theme.light

export const resolveInitialAttributes = () => {
  const params = new URLSearchParams(window.location.search)
  return {
    [ARCHIFY_CONTRACT.attribute.embed]:
      params.get(ARCHIFY_CONTRACT.query.embed) === ARCHIFY_CONTRACT.query.enabled
        ? ARCHIFY_CONTRACT.attribute.enabled
        : undefined,
    [ARCHIFY_CONTRACT.attribute.present]:
      params.get(ARCHIFY_CONTRACT.query.present) === ARCHIFY_CONTRACT.query.enabled
        ? ARCHIFY_CONTRACT.attribute.enabled
        : undefined,
    [ARCHIFY_CONTRACT.attribute.theme]: resolveInitialTheme(),
  }
}
