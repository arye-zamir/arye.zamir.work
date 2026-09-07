import { defineConfig, devices } from '@playwright/test'

const CONFIG = {
  baseURL: 'http://127.0.0.1:5015',
  colorScheme: 'light',
  command: 'pnpm preview --host 127.0.0.1 --port 5015 --strictPort',
  desktop: 'Desktop Chrome',
  directory: './tests/e2e',
  locale: 'en-US',
  mobile: 'Pixel 7',
  narrow: { height: 800, width: 320 },
  narrowName: 'Small mobile',
  output: 'test-results',
  screenshot: 'only-on-failure',
  timeout: 30_000,
  trace: 'retain-on-failure',
  workers: 1,
}

export default defineConfig({
  outputDir: CONFIG.output,
  projects: [
    { name: CONFIG.desktop, use: { ...devices[CONFIG.desktop] } },
    { name: CONFIG.mobile, use: { ...devices[CONFIG.mobile] } },
    { name: CONFIG.narrowName, use: { ...devices[CONFIG.mobile], viewport: CONFIG.narrow } },
  ],
  testDir: CONFIG.directory,
  timeout: CONFIG.timeout,
  use: {
    baseURL: CONFIG.baseURL,
    colorScheme: CONFIG.colorScheme,
    locale: CONFIG.locale,
    screenshot: CONFIG.screenshot,
    trace: CONFIG.trace,
  },
  webServer: {
    command: CONFIG.command,
    url: CONFIG.baseURL,
  },
  workers: CONFIG.workers,
})
