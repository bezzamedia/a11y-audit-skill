// Lighthouse accessibility pass. Reuses Playwright's Chromium binary (no second
// download): chrome-launcher ships with lighthouse and is pointed at Playwright's
// executable. Entirely best-effort — any failure degrades to "Lighthouse skipped"
// and the report still stands on axe + the manual checklist.

import { chromiumExecutablePath } from './browser.mjs'

async function loadDeps() {
  const [{ default: lighthouse }, chromeLauncher] = await Promise.all([
    import('lighthouse'),
    import('chrome-launcher'),
  ])
  return { lighthouse, launch: chromeLauncher.launch }
}

/**
 * Run Lighthouse (accessibility category only) against a list of URLs.
 * @returns {Promise<{available:boolean, reason?:string,
 *                    pages: Record<string,{score:number|null, failedAudits:object[]}>}>}
 */
export async function runLighthouse(urls, { throttleMs = 0 } = {}, log) {
  let deps
  try {
    deps = await loadDeps()
  } catch (err) {
    return { available: false, reason: `lighthouse/chrome-launcher not loadable: ${err.message}`, pages: {} }
  }

  const chromePath = await chromiumExecutablePath()
  let chrome
  try {
    chrome = await deps.launch({
      chromePath: chromePath || undefined,
      chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    })
  } catch (err) {
    return { available: false, reason: `could not launch Chrome for Lighthouse: ${err.message}`, pages: {} }
  }

  const flags = {
    port: chrome.port,
    onlyCategories: ['accessibility'],
    output: 'json',
    logLevel: 'error',
  }

  const pages = {}
  try {
    for (const url of urls) {
      try {
        const result = await deps.lighthouse(url, flags)
        const lhr = result && result.lhr
        if (!lhr) {
          pages[url] = { score: null, failedAudits: [] }
          continue
        }
        const category = lhr.categories.accessibility
        const score = category && typeof category.score === 'number' ? Math.round(category.score * 100) : null
        const refIds = new Set((category?.auditRefs || []).map((r) => r.id))
        const failedAudits = []
        for (const [id, audit] of Object.entries(lhr.audits || {})) {
          if (!refIds.has(id)) continue
          if (audit.score === null) continue
          if (audit.score < 1 && (audit.scoreDisplayMode === 'binary' || audit.scoreDisplayMode === 'numeric')) {
            failedAudits.push({ id, title: audit.title, description: audit.description })
          }
        }
        pages[url] = { score, failedAudits }
        log?.(`lighthouse: ${url} -> ${score ?? '—'}/100`)
      } catch (err) {
        pages[url] = { score: null, failedAudits: [], error: String(err.message || err) }
      }
      if (throttleMs > 0) await new Promise((r) => setTimeout(r, throttleMs))
    }
  } finally {
    // chrome-launcher's kill() returns void in current versions — don't .catch() it
    try {
      await chrome.kill()
    } catch {
      /* already gone */
    }
  }

  return { available: true, pages }
}
