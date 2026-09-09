import { expect, test } from '@playwright/test'

const ATTRIBUTE = {
  content: 'content',
  direction: 'dir',
  href: 'href',
  language: 'lang',
}

const PATH = {
  post: '/read/agent-memory-resolution',
  read: '/read',
  unknown: '/read/no-such-post',
}

const SELECTOR = {
  body: '.journal-body',
  description: 'meta[name="description"]',
  entry: '.journal-entry',
  flag: '.language-flag',
  root: 'html',
}

const TEST = {
  backNavigation: 'post pages navigate back to the read page and restore its metadata',
  deepLink: 'post pages load directly from their URL',
  navigation: 'read page links each post to its own page',
  unknown: 'unknown post slugs use the site not-found page',
}

const UI = {
  backLabel: 'All posts',
  description: 'A study on agentic memory finds that small, transferable skills beat task-level summaries',
  flagLabel: 'Post written in Hebrew',
  fullPost: 'Full post',
  hebrew: 'he',
  linkedin: 'View the original on LinkedIn',
  notFound: 'Off the map.',
  pageDescription:
    'A study on agentic memory finds that small, transferable skills beat task-level summaries — and that a skill’s utility can be scored before it reaches production.',
  pageTitle: 'At what resolution should an AI agent remember? | Arye Zamir',
  readDescription:
    'Field notes by software developer Arye Zamir on engineering decisions, product craft, and dependable systems.',
  readTitle: 'Writing | Arye Zamir',
  rtl: 'rtl',
  title: 'At what resolution should an AI agent remember?',
}

const VALUE = {
  headingLevel: 1,
  posts: 4,
  zero: 0,
}

test(TEST.navigation, async ({ page }) => {
  await page.goto(PATH.read)

  const entries = page.locator(SELECTOR.entry)
  const firstEntry = entries.first()

  await expect(entries).toHaveCount(VALUE.posts)
  await expect(page.locator(SELECTOR.flag)).toHaveCount(VALUE.posts)
  await expect(firstEntry.getByRole('link', { name: UI.title })).toBeVisible()
  await expect(firstEntry.getByText(UI.description)).toBeVisible()
  await firstEntry.getByRole('link', { name: UI.fullPost }).click()
  await expect(page).toHaveURL(new RegExp(PATH.post))
  await expect(page.getByRole('heading', { level: VALUE.headingLevel, name: UI.title })).toBeVisible()
})

test(TEST.deepLink, async ({ page }) => {
  await page.goto(PATH.post)

  const body = page.locator(SELECTOR.body)

  await expect(page.getByRole('heading', { level: VALUE.headingLevel, name: UI.title })).toBeVisible()
  await expect(page.getByRole('img', { name: UI.flagLabel })).toBeVisible()
  await expect(body).toBeVisible()
  await expect(body).toHaveAttribute(ATTRIBUTE.direction, UI.rtl)
  await expect(body).toHaveAttribute(ATTRIBUTE.language, UI.hebrew)
  await expect(page.getByRole('link', { name: UI.linkedin })).toHaveAttribute(ATTRIBUTE.href, /lnkd\.in/)
  await expect(page).toHaveTitle(UI.pageTitle)
  await expect(page.locator(SELECTOR.description)).toHaveAttribute(ATTRIBUTE.content, UI.pageDescription)

  const overflow = await page.locator(SELECTOR.root).evaluate((root) => root.scrollWidth - root.clientWidth)
  expect(overflow).toBe(VALUE.zero)
})

test(TEST.backNavigation, async ({ page }) => {
  await page.goto(PATH.post)

  await page.getByRole('link', { name: UI.backLabel }).click()

  await expect(page).toHaveURL(new RegExp(`${PATH.read}$`))
  await expect(page.locator(SELECTOR.entry)).toHaveCount(VALUE.posts)
  await expect(page).toHaveTitle(UI.readTitle)
  await expect(page.locator(SELECTOR.description)).toHaveAttribute(ATTRIBUTE.content, UI.readDescription)
})

test(TEST.unknown, async ({ page }) => {
  await page.goto(PATH.unknown)

  await expect(page.getByRole('heading', { name: UI.notFound })).toBeVisible()
})
