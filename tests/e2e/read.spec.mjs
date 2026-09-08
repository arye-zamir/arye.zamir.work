import { expect, test } from '@playwright/test'

const ATTRIBUTE = {
  direction: 'dir',
  href: 'href',
  language: 'lang',
}

const PATH = {
  read: '/read',
}

const SELECTOR = {
  body: '.journal-body',
  entry: '.journal-entry',
  root: 'html',
}

const TEST = {
  posts: 'read page presents the four selected social posts',
}

const UI = {
  fullPost: 'Full post',
  hebrew: 'he',
  linkedin: 'View the original on LinkedIn',
  rtl: 'rtl',
  title: 'באיזו רזולוציה סוכן AI צריך לזכור?',
}

const VALUE = {
  posts: 4,
  zero: 0,
}

test(TEST.posts, async ({ page }) => {
  await page.goto(PATH.read)

  const entries = page.locator(SELECTOR.entry)
  const firstEntry = entries.first()

  await expect(entries).toHaveCount(VALUE.posts)
  const title = firstEntry.getByRole('heading', { name: UI.title })
  await expect(title).toBeVisible()
  await expect(title).toHaveAttribute(ATTRIBUTE.direction, UI.rtl)
  await expect(title).toHaveAttribute(ATTRIBUTE.language, UI.hebrew)
  await firstEntry.getByText(UI.fullPost, { exact: true }).click()
  await expect(firstEntry.locator(SELECTOR.body)).toBeVisible()
  await expect(firstEntry.locator(SELECTOR.body)).toHaveAttribute(ATTRIBUTE.direction, UI.rtl)
  await expect(firstEntry.locator(SELECTOR.body)).toHaveAttribute(ATTRIBUTE.language, UI.hebrew)
  await expect(firstEntry.getByRole('link', { name: UI.linkedin })).toHaveAttribute(ATTRIBUTE.href, /lnkd\.in/)

  const overflow = await page.locator(SELECTOR.root).evaluate((root) => root.scrollWidth - root.clientWidth)
  expect(overflow).toBe(VALUE.zero)
})
