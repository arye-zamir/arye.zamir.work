import { createApp } from 'vue'

import '../static/style.css'
import App from '../app/App.vue'
import { APP as APP_GLOBAL } from './app'
import { i18n } from './i18n'
import { router } from './router'

export const bootApp = () => {
  const app = createApp(App)
  app.config.globalProperties.$app = APP_GLOBAL
  app.use(i18n)
  app.use(router)
  app.mount('#app')
  return app
}
