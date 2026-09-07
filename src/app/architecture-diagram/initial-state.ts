import { browserLocation } from '../../services/browser'
import { isThemePreference, theme, type ThemePreference } from '../../services/theme'
import { ARCHIFY_CONTRACT } from './archify-contract'

export const readThemeOverride = (): null | ThemePreference => {
  const value = browserLocation().searchParams.get(ARCHIFY_CONTRACT.query.theme)
  return isThemePreference(value) ? value : null
}

export const resolveInitialTheme = () => theme.resolve(readThemeOverride() ?? theme.getPreference())

export const resolveInitialAttributes = () => {
  const params = browserLocation().searchParams
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
