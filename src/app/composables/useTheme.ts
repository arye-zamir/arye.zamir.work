import { onScopeDispose, readonly, ref } from 'vue'

import { theme } from '../../services/theme'

export const useTheme = () => {
  const preference = ref(theme.getPreference())
  onScopeDispose(
    theme.subscribe((snapshot): void => {
      preference.value = snapshot.preference
    }),
  )
  return { preference: readonly(preference), setTheme: theme.set }
}
