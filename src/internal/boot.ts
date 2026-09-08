import { createApp } from 'vue'

import '../static/style.css'
import App from '../app/App.vue'
import { installAnalytics } from '../services/analytics'
import { theme } from '../services/theme'
import { APP as APP_GLOBAL } from './app'
import { i18n } from './i18n'
import { router } from './router'

const THEME_ATTRIBUTE = 'data-theme'

export const bootApp = () => {
  installAnalytics()
  const app = createApp(App)
  app.config.globalProperties.$app = APP_GLOBAL
  app.use(i18n)
  app.use(router)
  app.onUnmount(
    theme.subscribe(({ resolved }) => void document.documentElement.setAttribute(THEME_ATTRIBUTE, resolved)),
  )
  app.mount('#app')
  return app
}
