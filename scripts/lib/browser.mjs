// Playwright Chromium launch + context for the axe pass. Lighthouse runs in a
// separate pass (run-lighthouse.mjs) but reuses the SAME downloaded Chromium
// binary, so there is never a second browser download.

import fs from 'node:fs'

// Playwright is imported lazily so that `a11y-scan --help`/`--doctor` work before
// dependencies are installed (the static import would otherwise fail to resolve).
let _chromium
async function getChromium() {
  if (!_chromium) ({ chromium: _chromium } = await import('playwright'))
  return _chromium
}

/** Absolute path to Playwright's bundled Chromium (may not be installed yet). */
export async function chromiumExecutablePath() {
  try {
    const chromium = await getChromium()
    return chromium.executablePath()
  } catch {
    return null
  }
}

export async function isChromiumInstalled() {
  const p = await chromiumExecutablePath()
  return Boolean(p && fs.existsSync(p))
}

/**
 * Launch Chromium and create a context for the axe pass.
 * opts: { authState?:string, basicAuth?:string, headers?:object }
 * @returns {Promise<{browser, context, close:Function}>}
 */
export async function launchAxeBrowser(opts = {}) {
  const chromium = await getChromium()
  const browser = await chromium.launch({ headless: true })

  const contextOptions = {
    // a realistic desktop viewport; axe is layout-aware for some checks
    viewport: { width: 1366, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) a11y-scan/1.0 Chrome/Safari',
  }

  if (opts.authState && fs.existsSync(opts.authState)) {
    contextOptions.storageState = opts.authState
  }
  if (opts.basicAuth && opts.basicAuth.includes(':')) {
    const [username, ...rest] = opts.basicAuth.split(':')
    contextOptions.httpCredentials = { username, password: rest.join(':') }
  }
  if (opts.headers && Object.keys(opts.headers).length) {
    contextOptions.extraHTTPHeaders = opts.headers
  }

  const context = await browser.newContext(contextOptions)
  context.setDefaultNavigationTimeout(45000)

  return {
    browser,
    context,
    close: async () => {
      await context.close().catch(() => {})
      await browser.close().catch(() => {})
    },
  }
}

/**
 * Navigate and wait for the page to settle (handles SPA hydration).
 * Returns { ok, status, finalUrl }.
 */
export async function gotoSettled(page, url, { settleMs = 800, waitSelector } = {}) {
  let status = 0
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded' })
    status = resp ? resp.status() : 0
    // best-effort network idle, but don't hang forever on long-polling sites
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
    if (waitSelector) {
      await page.waitForSelector(waitSelector, { timeout: 8000 }).catch(() => {})
    }
    if (settleMs > 0) await page.waitForTimeout(settleMs)
    return { ok: status > 0 && status < 400, status, finalUrl: page.url() }
  } catch (err) {
    return { ok: false, status, finalUrl: url, error: String(err && err.message || err) }
  }
}
