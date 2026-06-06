// Shared helpers for the a11y scanner: severity mapping, WCAG parsing,
// URL normalisation and small utilities. No third-party imports here.

import fs from 'node:fs'
import path from 'node:path'

/** axe impact level -> P-severity. null/unknown impact defaults to P2. */
export const AXE_IMPACT_TO_SEVERITY = {
  critical: 'P0',
  serious: 'P1',
  moderate: 'P2',
  minor: 'P3',
}

export const SEVERITY_ORDER = ['P0', 'P1', 'P2', 'P3']

export function impactToSeverity(impact) {
  return AXE_IMPACT_TO_SEVERITY[impact] || 'P2'
}

/**
 * Convert axe rule tags into WCAG success-criterion numbers.
 * Tag form is `wcag<principle><guideline><criterion>` where the criterion
 * may be multi-digit, e.g. `wcag143` -> "1.4.3", `wcag1410` -> "1.4.10".
 * Level tags (`wcag2a`, `wcag21aa`, ...) and non-wcag tags are ignored.
 */
export function parseWcagTags(tags = []) {
  const out = []
  for (const tag of tags) {
    const m = /^wcag(\d)(\d)(\d+)$/.exec(tag)
    if (m) out.push(`${m[1]}.${m[2]}.${m[3]}`)
  }
  return [...new Set(out)].sort()
}

/** axe tag set per conformance level. */
export function axeTagsForLevel(level = 'AA') {
  const l = String(level).toUpperCase()
  if (l === 'A') return ['wcag2a', 'wcag21a']
  if (l === 'AAA') return ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag22aa']
  // AA (default) — A + AA across 2.0/2.1/2.2
  return ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
}

const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$|igshid$)/i

/**
 * Normalise a URL for de-duplication: resolve against base, drop the hash,
 * strip tracking query params, lowercase host, and remove a trailing slash
 * (except the root path). Returns null for non-http(s) or cross-origin URLs
 * when `sameOriginAs` is supplied.
 */
export function normalizeUrl(href, base, sameOriginAs) {
  let u
  try {
    u = new URL(href, base)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (sameOriginAs) {
    const origin = new URL(sameOriginAs)
    if (u.host !== origin.host) return null
  }
  u.hash = ''
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key)
  }
  u.host = u.host.toLowerCase()
  if (u.pathname !== '/' && u.pathname.endsWith('/')) {
    u.pathname = u.pathname.replace(/\/+$/, '')
  }
  // collapse duplicate slashes in the path
  u.pathname = u.pathname.replace(/\/{2,}/g, '/')
  return u.toString()
}

const NON_HTML_EXT = new Set([
  '.pdf', '.zip', '.gz', '.tar', '.rar', '.7z',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.ico', '.bmp',
  '.mp4', '.webm', '.mov', '.mp3', '.wav', '.ogg',
  '.css', '.js', '.mjs', '.json', '.xml', '.txt', '.rss',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv',
])

/** Heuristic: does this URL look like a non-HTML resource we should skip? */
export function isNonHtmlUrl(urlStr) {
  let u
  try {
    u = new URL(urlStr)
  } catch {
    return false
  }
  const ext = path.extname(u.pathname).toLowerCase()
  return NON_HTML_EXT.has(ext)
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Run async tasks with a bounded concurrency pool, preserving input order. */
export async function pool(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++
      if (i >= items.length) break
      results[i] = await worker(items[i], i)
    }
  })
  await Promise.all(runners)
  return results
}

/** Short, filesystem-safe slug for a host name. */
export function slugHost(urlStr) {
  try {
    return new URL(urlStr).host.replace(/[^a-z0-9.-]+/gi, '-').replace(/^-+|-+$/g, '')
  } catch {
    return 'site'
  }
}

/** Today's date as YYYY-MM-DD (local). */
export function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10)
}

/**
 * Resolve the output directory for reports inside the audited project:
 * prefer <cwd>/docs/audits/accessibility, else <cwd>/reports/accessibility.
 * An explicit --out always wins.
 */
export function resolveOutDir(explicitOut, cwd = process.cwd()) {
  if (explicitOut) return path.resolve(cwd, explicitOut)
  if (fs.existsSync(path.join(cwd, 'docs'))) {
    return path.join(cwd, 'docs', 'audits', 'accessibility')
  }
  return path.join(cwd, 'reports', 'accessibility')
}

export function isLocalHost(urlStr) {
  try {
    const h = new URL(urlStr).hostname
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.local')
  } catch {
    return false
  }
}
