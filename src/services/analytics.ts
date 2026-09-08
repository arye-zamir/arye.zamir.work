import { injectHeadScript } from './browser'

const ANALYTICS = { beaconUrl: 'https://static.cloudflareinsights.com/beacon.min.js' } as const
const token = import.meta.env.VITE_CF_ANALYTICS_TOKEN

export const installAnalytics = (): void => {
  if (!token) return
  injectHeadScript({
    'data-cf-beacon': JSON.stringify({ spa: true, token }),
    src: ANALYTICS.beaconUrl,
    type: 'module',
  })
}
