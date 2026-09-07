import { expect, test } from '@playwright/test'

const TEST = {
  controls: 'footer theme persistence, node finder, and semantic lens work through visible controls',
  history: 'viewer state preserves page navigation and cleans up on exit',
  interaction: 'renders the Alektions diagram and supports exploration',
  layout: 'viewer header and canvas controls stay aligned on every viewport',
  locale: 'English diagram remains LTR in the Hebrew site',
  mode: 'direct presentation and embed links initialize correctly',
  notFound: 'unknown diagrams use the site not-found page',
  split: 'ordinary pages do not load the diagram runtime or styles',
  stability: 'canvas dimensions remain stable across desktop window sizes',
}

const PATH = {
  diagram: '/see/alektions-election-events-map',
  embed: '?theme=light&embed=1',
  focused: '?theme=light#focus=server',
  home: '/',
  invalid: '/see/missing-diagram',
  present: '?theme=light&present=1',
  see: '/see',
}

const UI = {
  back: 'Selected work',
  dark: 'dark',
  english: 'en',
  explore: 'Explore the architecture',
  guide: 'Diagram guide',
  hebrew: 'he',
  hebrewButton: 'עברית',
  light: 'light',
  lightButton: 'Light',
  ltr: 'ltr',
  nextView: /^Open chapter 1 of 3:/,
  notFound: 'Off the map.',
  rtl: 'rtl',
  theme: 'Dark',
  title: 'Alektions: Live Election-Events Map',
  true: 'true',
}

const SELECTOR = {
  back: '.viewer-back',
  body: 'body',
  canvas: '.diagram-container',
  controls: '.diagram-nav',
  diagram: '.architecture-diagram',
  finder: '#node-finder',
  finderInput: '#node-finder-input',
  focus: '#focus-chip',
  guide: '#diagram-guide',
  header: '.viewer-header',
  heading: 'h1',
  html: 'html',
  icons: '.viewer-control-icon, .viewer-back-icon',
  lens: '#semantic-lens',
  node: '.diagram-container > svg [data-node-id]',
  server: '.diagram-container > svg #node-server',
  svg: '.diagram-container > svg',
  toolbar: '.toolbar',
}

const ATTRIBUTE = {
  direction: 'dir',
  embed: 'data-embed',
  language: 'lang',
  present: 'data-present',
  pressed: 'aria-pressed',
  theme: 'data-theme',
}

const KEY = { escape: 'Escape', finder: '/', guide: '?', lens: 'l', theme: 't' }
const EVENT = { error: 'pageerror', request: 'request' }
const PATTERN = { diagramAsset: /DiagramView-.*\.(?:js|css)/, focus: /#focus=server$/, view: /#view=/ }
const VALUE = { emptyCount: 0, nodeCount: 12 }
const LAYOUT = { button: 'button', controlHeight: 44, first: 0, iconSize: 20, scrollOffset: 100, tolerance: 2 }
const PROOF = { animations: 'disabled', dark: 'viewer-dark.png', light: 'viewer-light.png' }
const FORBIDDEN_COPY = /[\u2013\u2014]|--/
const MOTION = {
  behavior: 'instant',
  frames: 90,
  viewports: [
    { height: 1200, width: 1440 },
    { height: 1080, width: 1920 },
    { height: 1200, width: 1920 },
    { height: 1440, width: 2560 },
  ],
  warmup: 12,
}

test(TEST.stability, async ({ isMobile, page }) => {
  test.skip(isMobile)
  await page.goto(PATH.diagram)
  await expect(page.locator(SELECTOR.controls)).toBeVisible()
  await page.locator(SELECTOR.html).evaluate((html) => html.ownerDocument.fonts.ready)
  for (const viewport of MOTION.viewports) {
    await page.setViewportSize(viewport)
    const samples = await page.locator(SELECTOR.canvas).evaluate(async (canvas, motion) => {
      const samples = []
      for (let frame = 0; frame < motion.frames; frame++) {
        await new Promise((resolve) => void canvas.ownerDocument.defaultView.requestAnimationFrame(resolve))
        if (frame < motion.warmup) continue
        const { height, width, x, y } = canvas.getBoundingClientRect()
        samples.push({ height, width, x, y })
      }
      return samples
    }, MOTION)
    for (const dimension of Object.keys(samples[LAYOUT.first])) {
      const values = samples.map((sample) => sample[dimension])
      expect(Math.max(...values) - Math.min(...values)).toBeLessThan(LAYOUT.tolerance)
    }
  }
})

test(TEST.layout, async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: UI.dark })
  await page.goto(PATH.diagram)
  await expect(page.locator(SELECTOR.diagram)).toHaveAttribute(ATTRIBUTE.theme, UI.dark)
  await page.getByRole('button', { exact: true, name: UI.lightButton }).click()
  await expect(page.locator(SELECTOR.diagram)).toHaveAttribute(ATTRIBUTE.theme, UI.light)
  await expect(page.locator(SELECTOR.diagram)).not.toContainText(FORBIDDEN_COPY)
  const header = await page.locator(SELECTOR.header).boundingBox()
  const back = await page.locator(SELECTOR.back).boundingBox()
  const toolbar = await page.locator(SELECTOR.toolbar).boundingBox()
  expect(back.y).toBeGreaterThanOrEqual(header.y)
  expect(toolbar.y).toBeGreaterThanOrEqual(header.y)
  expect(back.y + back.height).toBeLessThanOrEqual(header.y + header.height)
  expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(header.y + header.height)
  const dimensions = await page
    .locator(SELECTOR.controls)
    .locator(LAYOUT.button)
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const { height, width } = button.getBoundingClientRect()
        return { height, width }
      }),
    )
  for (const button of dimensions) {
    expect(button.height).toBe(LAYOUT.controlHeight)
    expect(Math.abs(button.width - dimensions[LAYOUT.first].width)).toBeLessThan(LAYOUT.tolerance)
  }
  const iconSizes = await page.locator(SELECTOR.icons).evaluateAll((icons) =>
    icons.map((icon) => {
      const { height, width } = icon.getBoundingClientRect()
      return { height, width }
    }),
  )
  for (const icon of iconSizes) {
    expect(icon.width).toBe(LAYOUT.iconSize)
    expect(icon.height).toBe(LAYOUT.iconSize)
  }
  const centerOffset = async () => {
    const canvas = await page.locator(SELECTOR.canvas).boundingBox()
    const controls = await page.locator(SELECTOR.controls).boundingBox()
    return Math.abs(controls.x + controls.width / LAYOUT.tolerance - canvas.x - canvas.width / LAYOUT.tolerance)
  }
  await expect.poll(centerOffset).toBeLessThan(LAYOUT.tolerance)
  const diagramBounds = await page.locator(SELECTOR.svg).boundingBox()
  const controlBounds = await page.locator(SELECTOR.controls).boundingBox()
  expect(controlBounds.y).toBeGreaterThanOrEqual(diagramBounds.y + diagramBounds.height)
  const scrollOffsets = await page.locator(SELECTOR.canvas).evaluate(
    (canvas, { layout, motion, selector }) => {
      const controls = canvas.querySelector(selector.controls)
      return [layout.first, layout.scrollOffset, canvas.scrollWidth, layout.first].map((left) => {
        canvas.scrollTo({ behavior: motion.behavior, left })
        const canvasBounds = canvas.getBoundingClientRect()
        const controlsBounds = controls.getBoundingClientRect()
        return Math.abs(
          controlsBounds.x +
            controlsBounds.width / layout.tolerance -
            canvasBounds.x -
            canvasBounds.width / layout.tolerance,
        )
      })
    },
    { layout: LAYOUT, motion: MOTION, selector: SELECTOR },
  )
  for (const offset of scrollOffsets) expect(offset).toBeLessThan(LAYOUT.tolerance)
  await expect.poll(centerOffset).toBeLessThan(LAYOUT.tolerance)
  await page.screenshot({ animations: PROOF.animations, fullPage: true, path: testInfo.outputPath(PROOF.light) })
  await page.getByRole('button', { name: UI.theme }).click()
  await expect(page.locator(SELECTOR.diagram)).toHaveAttribute(ATTRIBUTE.theme, UI.dark)
  await page.screenshot({ animations: PROOF.animations, fullPage: true, path: testInfo.outputPath(PROOF.dark) })
})
const SEARCH = { result: /^Focus alektions-server,/, term: 'alektions-server' }

test(TEST.controls, async ({ page }) => {
  await page.goto(PATH.diagram)
  await expect(page.locator(SELECTOR.svg)).toBeVisible()
  await page.getByRole('button', { name: UI.theme }).click()
  await expect(page.locator(SELECTOR.diagram)).toHaveAttribute(ATTRIBUTE.theme, UI.dark)
  await page.reload()
  await expect(page.locator(SELECTOR.diagram)).toHaveAttribute(ATTRIBUTE.theme, UI.dark)
  await page.keyboard.press(KEY.finder)
  await expect(page.locator(SELECTOR.finder)).toBeVisible()
  await page.locator(SELECTOR.finderInput).fill(SEARCH.term)
  await page.locator(SELECTOR.finder).getByRole('button', { name: SEARCH.result }).click()
  await expect(page.locator(SELECTOR.server)).toHaveAttribute(ATTRIBUTE.pressed, UI.true)
  await expect(page.locator(SELECTOR.finder)).toBeHidden()
  await page.keyboard.press(KEY.escape)
  await page.keyboard.press(KEY.lens)
  await expect(page.locator(SELECTOR.lens)).toBeVisible()
  await page.keyboard.press(KEY.escape)
  await expect(page.locator(SELECTOR.lens)).toBeHidden()
})

test(TEST.interaction, async ({ page }, testInfo) => {
  const errors = []
  page.on(EVENT.error, (error) => errors.push(error.message))
  await page.goto(PATH.diagram + PATH.focused)
  await expect(page.locator(SELECTOR.heading)).toHaveText(UI.title)
  await expect(page.locator(SELECTOR.node)).toHaveCount(VALUE.nodeCount)
  await expect(page.locator(SELECTOR.diagram)).toHaveAttribute(ATTRIBUTE.theme, UI.light)
  await expect(page.locator(SELECTOR.server)).toHaveAttribute(ATTRIBUTE.pressed, UI.true)
  await expect(page.locator(SELECTOR.focus)).toBeVisible()
  await page.keyboard.press(KEY.escape)
  await page.keyboard.press(KEY.guide)
  await expect(page.locator(SELECTOR.guide)).toBeVisible()
  await page.keyboard.press(KEY.escape)
  await expect(page.locator(SELECTOR.guide)).toBeHidden()
  await page.getByRole('button', { exact: true, name: UI.nextView }).click()
  await expect(page).toHaveURL(PATTERN.view)
  await expect(page.locator(SELECTOR.svg)).toBeVisible()
  await page.screenshot({ fullPage: true, path: testInfo.outputPath('alektions.png') })
  expect(errors).toEqual([])
})

test(TEST.history, async ({ page }) => {
  await page.goto(PATH.see)
  await page.locator(`.text-link[href="${PATH.diagram}"]`).click()
  await expect(page.locator(SELECTOR.svg)).toBeVisible()
  await page.locator(SELECTOR.server).click()
  await expect(page).toHaveURL(PATTERN.focus)
  await expect(page.locator(SELECTOR.server)).toBeFocused()
  await page.goBack()
  await expect(page).toHaveURL(PATH.see)
  await expect(page.locator(SELECTOR.diagram)).toHaveCount(VALUE.emptyCount)
  await page.keyboard.press(KEY.theme)
  await page.keyboard.press(KEY.guide)
  await expect(page.locator(SELECTOR.guide)).toHaveCount(VALUE.emptyCount)
  await page.goForward()
  await expect(page.locator(SELECTOR.server)).toHaveAttribute(ATTRIBUTE.pressed, UI.true)
  await page.getByRole('link', { name: UI.back }).click()
  await expect(page).toHaveURL(PATH.see)
})

test(TEST.locale, async ({ page }) => {
  await page.goto(PATH.see)
  await page.getByRole('button', { exact: true, name: UI.hebrewButton }).click()
  await page.locator(`.portfolio-diagram h2 a[href="${PATH.diagram}"]`).click()
  await expect(page.locator(SELECTOR.html)).toHaveAttribute(ATTRIBUTE.direction, UI.rtl)
  await expect(page.locator(SELECTOR.diagram)).toHaveAttribute(ATTRIBUTE.direction, UI.ltr)
  await expect(page.locator(SELECTOR.diagram)).toHaveAttribute(ATTRIBUTE.language, UI.english)
  await expect(page.locator(SELECTOR.svg)).toBeVisible()
})

test(TEST.mode, async ({ page }) => {
  await page.goto(PATH.diagram + PATH.present)
  await expect(page.locator(SELECTOR.diagram)).toHaveAttribute(ATTRIBUTE.present, UI.true)
  await expect(page.getByRole('link', { name: UI.back })).toBeHidden()
  await page.keyboard.press(KEY.escape)
  await expect(page.getByRole('link', { name: UI.back })).toBeVisible()
  await page.goto(PATH.diagram + PATH.embed)
  await expect(page.locator(SELECTOR.diagram)).toHaveAttribute(ATTRIBUTE.embed, UI.true)
  await expect(page.locator(SELECTOR.toolbar)).toBeHidden()
  await expect(page.locator(SELECTOR.svg)).toBeVisible()
})

test(TEST.notFound, async ({ page }) => {
  await page.goto(PATH.invalid)
  await expect(page.locator(SELECTOR.heading)).toHaveText(UI.notFound)
  await expect(page.locator(SELECTOR.diagram)).toHaveCount(VALUE.emptyCount)
})

test(TEST.split, async ({ page }) => {
  const diagramAssets = []
  page.on(EVENT.request, (request) => {
    if (PATTERN.diagramAsset.test(request.url())) diagramAssets.push(request.url())
  })
  await page.goto(PATH.home)
  await page.goto(PATH.see)
  await expect(page.locator(`.text-link[href="${PATH.diagram}"]`)).toBeVisible()
  expect(diagramAssets).toEqual([])
})
