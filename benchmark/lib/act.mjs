// Helpers for the W3C ACT Rules test-case suite (https://act-rules.github.io).
// The published testcases.json lists ~1100 minimal HTML pages, each with an
// expected outcome (passed/failed/inapplicable) and the rule's accessibility
// requirements. We use the WCAG success criteria from those requirements to
// decide whether our scanner "should" flag the page.

import fs from 'node:fs'
import path from 'node:path'

const TESTCASES_URL = 'https://act-rules.github.io/testcases.json'
const SC_RE = /wcag[^:]*:(\d+)\.(\d+)\.(\d+)/i

/** Extract WCAG success criteria (e.g. "4.1.2") from a rule's requirements object. */
export function wcagFromRequirements(req) {
  const out = new Set()
  for (const key of Object.keys(req || {})) {
    const m = SC_RE.exec(key)
    if (m) out.add(`${m[1]}.${m[2]}.${m[3]}`)
  }
  return [...out]
}

/** Fetch the ACT test-case index, cached on disk for a week. */
export async function fetchTestcases(cacheDir) {
  const cachePath = path.join(cacheDir, 'testcases.json')
  if (fs.existsSync(cachePath)) {
    const ageMs = Date.now() - fs.statSync(cachePath).mtimeMs
    if (ageMs < 7 * 24 * 3600 * 1000) {
      return { data: JSON.parse(fs.readFileSync(cachePath, 'utf8')), cached: true }
    }
  }
  const res = await fetch(TESTCASES_URL)
  if (!res.ok) throw new Error(`kon testcases.json niet ophalen: HTTP ${res.status}`)
  const data = await res.json()
  fs.mkdirSync(cacheDir, { recursive: true })
  fs.writeFileSync(cachePath, JSON.stringify(data))
  return { data, cached: false }
}
