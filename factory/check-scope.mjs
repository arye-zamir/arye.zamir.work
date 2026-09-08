import { readFileSync } from 'node:fs'

const POLICY_PATH = 'factory/policy.json'
const EXIT_REFUSED = 1

const readPolicy = () => JSON.parse(readFileSync(POLICY_PATH, 'utf8'))

const permittedPaths = (policy) => {
  const paths = new Set([policy.translation.catalog])
  for (const element of Object.values(policy.elements)) {
    paths.add(element.component)
    if (element.style) paths.add(element.style.file)
  }
  return paths
}

const isForbidden = (policy, path) =>
  policy.forbidden.some((entry) => (entry.endsWith('/') ? path.startsWith(entry) : path === entry))

const violations = (policy, changed) => {
  const permitted = permittedPaths(policy)
  return changed.flatMap((path) => {
    if (isForbidden(policy, path)) return [`${path} — forbidden by policy`]
    if (!permitted.has(path)) return [`${path} — outside the approved mapping`]
    return []
  })
}

const changed = process.argv
  .slice(2)
  .flatMap((argument) => argument.split('\n'))
  .map((path) => path.trim())
  .filter(Boolean)

if (changed.length === 0) {
  console.error('refused: the pull request changes no files')
  process.exit(EXIT_REFUSED)
}

const found = violations(readPolicy(), changed)

if (found.length > 0) {
  console.error('refused: the patch leaves the approved scope')
  for (const violation of found) console.error(`  ${violation}`)
  process.exit(EXIT_REFUSED)
}

console.log(`approved scope: ${changed.length} file(s)`)
for (const path of changed) console.log(`  ${path}`)
