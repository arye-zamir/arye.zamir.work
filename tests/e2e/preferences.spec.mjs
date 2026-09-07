import { expect, test } from '@playwright/test'

const TEST = {
  blocked: 'theme controls keep working when browser storage is blocked',
  footer: 'theme and language controls appear in the footer on ordinary and diagram pages',
  storage: 'system theme uses one envelope and follows OS changes across tabs',
}
const UI = {
  dark: 'dark',
  darkButton: 'Dark',
  direction: 'dir',
  english: 'English',
  hebrew: 'עברית',
  languageGroup: 'Language',
  light: 'light',
  lightButton: 'Light',
  rtl: 'rtl',
  system: 'system',
  systemButton: 'System',
  themeGroup: 'Color theme',
  true: 'true',
}
const SELECTOR = {
  body: 'body',
  diagram: '.architecture-diagram',
  footer: '.site-footer',
  header: '.site-header',
  root: 'html',
  viewerHeader: '.viewer-header',
}
const PATH = { diagram: '/see/alektions-election-events-map', home: '/', see: '/see' }
const STORAGE = { api: 'localStorage', empty: 'null', key: 'zui__theme', legacy: 'archify-theme', str: 'str' }
const ATTRIBUTE = { complete: 'complete', naturalWidth: 'naturalWidth', pressed: 'aria-pressed', theme: 'data-theme' }
const SCREENSHOT = { animations: 'disabled', name: 'footer-preferences.png', portfolio: 'portfolio-mobile.png' }
const VALUE = { coverWidth: 2048, none: 0 }

test(TEST.footer, async ({ page }, testInfo) => {
  for (const path of [PATH.home, PATH.see, PATH.diagram]) {
    await page.goto(path)
    if (path === PATH.see) {
      await expect(page.getByRole('img')).toHaveJSProperty(ATTRIBUTE.complete, true)
      await expect(page.getByRole('img')).toHaveJSProperty(ATTRIBUTE.naturalWidth, VALUE.coverWidth)
      await page.screenshot({
        animations: SCREENSHOT.animations,
        fullPage: true,
        path: testInfo.outputPath(SCREENSHOT.portfolio),
      })
    }
    const footer = page.locator(SELECTOR.footer)
    await footer.scrollIntoViewIfNeeded()
    await expect(footer.getByRole('group', { name: UI.themeGroup })).toBeVisible()
    await expect(footer.getByRole('group', { name: UI.languageGroup })).toBeVisible()
    await expect(page.locator(SELECTOR.header).getByRole('group')).toHaveCount(VALUE.none)
    await expect(page.locator(SELECTOR.viewerHeader).getByRole('button', { name: UI.darkButton })).toHaveCount(
      VALUE.none,
    )
    const overflow = await page.locator(SELECTOR.root).evaluate((root) => root.scrollWidth - root.clientWidth)
    expect(overflow).toBe(VALUE.none)
  }
  await page.getByRole('button', { exact: true, name: UI.darkButton }).click()
  await expect(page.locator(SELECTOR.diagram)).toHaveAttribute(ATTRIBUTE.theme, UI.dark)
  await page.getByRole('button', { exact: true, name: UI.hebrew }).click()
  await expect(page.locator(SELECTOR.root)).toHaveAttribute(UI.direction, UI.rtl)
  await page
    .locator(SELECTOR.footer)
    .screenshot({ animations: SCREENSHOT.animations, path: testInfo.outputPath(SCREENSHOT.name) })
})

test(TEST.storage, async ({ context, page }) => {
  await page.emulateMedia({ colorScheme: UI.dark })
  await page.goto(PATH.home)
  const stored = () =>
    page
      .locator(SELECTOR.root)
      .evaluate(
        (root, storage) =>
          JSON.parse(root.ownerDocument.defaultView.localStorage.getItem(storage.key) ?? storage.empty),
        STORAGE,
      )
  await expect.poll(stored).toEqual({ as: STORAGE.str, val: UI.system })
  await expect(page.locator(SELECTOR.root)).toHaveAttribute(ATTRIBUTE.theme, UI.dark)
  await page.emulateMedia({ colorScheme: UI.light })
  await expect(page.locator(SELECTOR.root)).toHaveAttribute(ATTRIBUTE.theme, UI.light)
  const other = await context.newPage()
  await other.goto(PATH.diagram)
  await page.getByRole('button', { exact: true, name: UI.darkButton }).click()
  await expect(other.locator(SELECTOR.diagram)).toHaveAttribute(ATTRIBUTE.theme, UI.dark)
  await expect(other.getByRole('button', { exact: true, name: UI.darkButton })).toHaveAttribute(
    ATTRIBUTE.pressed,
    UI.true,
  )
  await expect.poll(stored).toEqual({ as: STORAGE.str, val: UI.dark })
  await other.reload()
  await expect(other.locator(SELECTOR.diagram)).toHaveAttribute(ATTRIBUTE.theme, UI.dark)
  await other.getByRole('button', { exact: true, name: UI.systemButton }).click()
  await expect(page.locator(SELECTOR.root)).toHaveAttribute(ATTRIBUTE.theme, UI.light)
  await expect.poll(stored).toEqual({ as: STORAGE.str, val: UI.system })
  await other.close()
})

test(TEST.blocked, async ({ page }) => {
  await page.addInitScript((storage) => {
    Object.defineProperty(globalThis, storage.api, {
      get: () => {
        throw new Error(storage.api)
      },
    })
  }, STORAGE)
  await page.goto(PATH.diagram)
  await page.getByRole('button', { exact: true, name: UI.darkButton }).click()
  await expect(page.locator(SELECTOR.diagram)).toHaveAttribute(ATTRIBUTE.theme, UI.dark)
  await page.getByRole('button', { exact: true, name: UI.lightButton }).click()
  await expect(page.locator(SELECTOR.diagram)).toHaveAttribute(ATTRIBUTE.theme, UI.light)
})
