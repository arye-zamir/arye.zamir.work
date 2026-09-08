import { readFileSync } from 'node:fs'

const POLICY_PATH = 'factory/policy.json'
const EXIT_REFUSED = 1
const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/

const parseDiff = (diff) => {
  const files = new Map()
  let path = null
  let line = 0
  for (const row of diff.split('\n')) {
    if (row.startsWith('+++ b/')) {
      path = row.slice(6)
      files.set(path, { changed: [], lines: [] })
      continue
    }
    if (!path) continue
    const hunk = HUNK.exec(row)
    if (hunk) {
      line = Number(hunk[1])
      continue
    }
    if (row.startsWith('+') && !row.startsWith('+++')) {
      files.get(path).changed.push(row.slice(1))
      files.get(path).lines.push(line)
      line += 1
    } else if (row.startsWith('-') && !row.startsWith('---')) {
      files.get(path).changed.push(row.slice(1))
      files.get(path).lines.push(line)
    } else if (row.startsWith(' ')) {
      line += 1
    }
  }
  return files
}

const selectorAt = (cssPath, lineNumbers) => {
  const rows = readFileSync(cssPath, 'utf8').split('\n')
  const blocks = []
  let current = null
  rows.forEach((row, index) => {
    const opened = row.includes('{')
    if (opened && !current) current = { end: 0, selector: row.split('{')[0].trim(), start: index + 1 }
    if (row.includes('}') && current) {
      current.end = index + 1
      blocks.push(current)
      current = null
    }
  })
  return lineNumbers.map((n) => blocks.find((b) => n >= b.start && n <= b.end)?.selector ?? '<outside any rule>')
}

const policy = JSON.parse(readFileSync(POLICY_PATH, 'utf8'))
const diff = readFileSync(process.argv[2], 'utf8')
const files = parseDiff(diff)

const permitted = new Set([policy.translation.catalog])
const styleFiles = new Map()
const keys = new Set()
for (const element of Object.values(policy.elements)) {
  permitted.add(element.component)
  if (element.style) {
    permitted.add(element.style.file)
    styleFiles.set(element.style.file, new Set(element.style.selectors))
  }
  for (const key of element.translation?.keys ?? []) keys.add(key.split('.').pop())
}

const forbidden = (path) =>
  policy.forbidden.some((entry) => (entry.endsWith('/') ? path.startsWith(entry) : path === entry))

const violations = []
if (files.size === 0) violations.push('the patch changes no files')

for (const [path, { changed, lines }] of files) {
  if (forbidden(path)) {
    violations.push(`${path} — forbidden by policy`)
    continue
  }
  if (!permitted.has(path)) {
    violations.push(`${path} — outside the approved mapping`)
    continue
  }
  if (path === policy.translation.catalog) {
    for (const row of changed) {
      const key = /^\s*([A-Za-z0-9_]+)\s*:/.exec(row)?.[1]
      if (!key || !keys.has(key)) violations.push(`${path} — touches an unapproved message: ${row.trim()}`)
    }
  }
  const allowed = styleFiles.get(path)
  if (allowed) {
    for (const selector of selectorAt(path, lines)) {
      if (!allowed.has(selector)) violations.push(`${path} — touches an unapproved rule: ${selector}`)
    }
  }
}

if (violations.length > 0) {
  console.error('refused: the patch leaves the approved scope')
  for (const violation of [...new Set(violations)]) console.error(`  ${violation}`)
  process.exit(EXIT_REFUSED)
}

console.log(`approved scope: ${[...files.keys()].join(', ')}`)
