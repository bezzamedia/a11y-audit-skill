#!/usr/bin/env node
// a11y-scan — stack-agnostic accessibility scanner (axe-core + Lighthouse).
// Runs against any running URL (local dev server or live production) and writes
// a P0–P3 WCAG report. See `a11y-scan --help`.

import fs from 'node:fs'
import { parseArgs } from 'node:util'

import { runDoctor } from './doctor.mjs'
import { discover } from './lib/discover.mjs'
import { launchAxeBrowser, gotoSettled } from './lib/browser.mjs'
import { runAxeOnPage } from './lib/run-axe.mjs'
import { runHtmlcsOnPage } from './lib/run-htmlcs.mjs'
import { runLighthouse } from './lib/run-lighthouse.mjs'
import { dismissConsent } from './lib/consent.mjs'
import { mergeResults } from './lib/merge.mjs'
import { buildReport, writeReport } from './lib/report.mjs'
import { pool, resolveOutDir, isLocalHost, isoDate } from './lib/util.mjs'

const SEVERITY_RANK = { P0: 0, P1: 1, P2: 2, P3: 3 }

const HELP = `
a11y-scan <baseUrl> [opties]

  Scant een draaiende site (lokaal of productie) met axe-core + Lighthouse en
  schrijft een WCAG-rapport (P0–P3) als Markdown + JSON.

DISCOVERY
  --routes <a,/b>        expliciete paden/URLs (herhaalbaar of komma-gescheiden)
  --config <bestand>     JSON-config met o.a. { "routes": [...] }
  --no-sitemap           sitemap.xml niet automatisch proberen
  --crawl                same-origin crawl forceren
  --max-pages <n>        max. pagina's (default 20)
  --max-depth <n>        crawl-diepte (default 2)

ENGINES / WCAG
  --level <A|AA|AAA>     conformiteitsniveau (default AA)
  --no-lighthouse        Lighthouse-score overslaan (sneller)
  --no-htmlcs            tweede engine (HTML_CodeSniffer) overslaan
  --include <sel>        beperk axe tot selector(s) (herhaalbaar)
  --exclude <sel>        negeer selector(s), bv. third-party widgets (herhaalbaar)

RENDER / AUTH
  --settle-ms <n>        extra wachttijd na networkidle (default 800)
  --wait-selector <css>  wacht tot element aanwezig is (hydratie-sentinel)
  --dismiss-consent      cookie-banner automatisch sluiten
  --consent-selector <css>  eigen selector voor de accepteer-knop
  --auth-state <bestand> Playwright storageState.json (ingelogde sessie)
  --basic-auth <u:p>     HTTP basic auth
  --throttle <ms>        wachttijd tussen requests (default 0 lokaal / 300 remote)
  --concurrency <n>      parallelle pagina's (default 4 lokaal / 1 remote)

OUTPUT
  --out <dir>            outputmap (default docs/audits/accessibility of reports/)
  --format <md|json|html|both|all>  default all (md + json + html)
  --stdout               JSON naar stdout, geen bestanden
  --fail-on <P0|P1|P2|P3>  exit-code drempel voor CI (default P1)

OVERIG
  --doctor               alleen deps/versie-check
  --help                 deze tekst
`

function parse() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      routes: { type: 'string', multiple: true },
      config: { type: 'string' },
      'no-sitemap': { type: 'boolean' },
      crawl: { type: 'boolean' },
      'max-pages': { type: 'string' },
      'max-depth': { type: 'string' },
      level: { type: 'string' },
      'no-lighthouse': { type: 'boolean' },
      'no-htmlcs': { type: 'boolean' },
      include: { type: 'string', multiple: true },
      exclude: { type: 'string', multiple: true },
      'settle-ms': { type: 'string' },
      'wait-selector': { type: 'string' },
      'dismiss-consent': { type: 'boolean' },
      'consent-selector': { type: 'string' },
      'auth-state': { type: 'string' },
      'basic-auth': { type: 'string' },
      throttle: { type: 'string' },
      concurrency: { type: 'string' },
      out: { type: 'string' },
      format: { type: 'string' },
      stdout: { type: 'boolean' },
      'fail-on': { type: 'string' },
      doctor: { type: 'boolean' },
      help: { type: 'boolean' },
    },
  })
  return { values, positionals }
}

const log = (...a) => console.error('[a11y-scan]', ...a)

async function main() {
  const { values, positionals } = parse()

  if (values.help) {
    console.log(HELP)
    return 0
  }

  // --- doctor ---
  const status = await runDoctor()
  if (values.doctor) {
    const tick = (b) => (b ? '✓' : '✗')
    for (const [name, info] of Object.entries(status.results.packages)) {
      console.log(`${tick(info.ok)} ${name} ${info.version || '(ontbreekt)'}`)
    }
    console.log(`${tick(status.results.chromium.ok)} chromium ${status.results.chromium.path || '(ontbreekt)'}`)
    return status.needsInstall || status.needsBrowser ? 1 : 0
  }

  // core deps required to do anything
  const corePackagesOk =
    status.results.packages.playwright.ok &&
    status.results.packages['@axe-core/playwright'].ok
  if (!corePackagesOk || status.needsBrowser) {
    log('Ontbrekende dependencies. Draai eerst:')
    if (!corePackagesOk) log('  npm ci --prefix ~/.claude/skills/accessibility/scripts')
    if (status.needsBrowser) log('  npx --prefix ~/.claude/skills/accessibility/scripts playwright install chromium')
    return 2
  }

  const baseUrl = positionals[0]
  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
    log('Geef een volledige base-URL op, bv: a11y-scan http://localhost:3030')
    console.log(HELP)
    return 2
  }

  // --- config file (routes etc.) ---
  let configRoutes = null
  if (values.config) {
    try {
      const cfg = JSON.parse(fs.readFileSync(values.config, 'utf8'))
      if (Array.isArray(cfg.routes)) configRoutes = cfg.routes
    } catch (err) {
      log(`Kon config niet lezen: ${err.message}`)
      return 2
    }
  }

  const local = isLocalHost(baseUrl)
  const level = (values.level || 'AA').toUpperCase()
  const maxPages = Number(values['max-pages'] || 20)
  const maxDepth = Number(values['max-depth'] || 2)
  const concurrency = Number(values.concurrency || (local ? 4 : 1))
  const throttle = Number(values.throttle ?? (local ? 0 : 300))
  const settleMs = Number(values['settle-ms'] ?? 800)
  const lighthouseEnabled = !values['no-lighthouse']
  const htmlcsEnabled = !values['no-htmlcs']
  const failOn = (values['fail-on'] || 'P1').toUpperCase()

  // --- discovery ---
  log(`doel: ${baseUrl} · WCAG ${level} · max ${maxPages} pagina's · concurrency ${concurrency}`)
  const routesInput = configRoutes || values.routes
  const { urls, skipped, source, truncated } = await discover(
    baseUrl,
    { routes: routesInput, sitemap: values['no-sitemap'] ? false : null, doCrawl: values.crawl, maxPages, maxDepth },
    log
  )
  log(`discovery (${source}): ${urls.length} pagina's te toetsen`)
  if (urls.length === 0) {
    log('Geen pagina\'s gevonden. Draait de server? Probeer --routes of --crawl.')
    return 2
  }

  // --- axe pass ---
  const headers = {}
  const { context, close } = await launchAxeBrowser({
    authState: values['auth-state'],
    basicAuth: values['basic-auth'],
    headers,
  })

  let anyConsentDismissed = false
  const pageResults = await pool(urls, concurrency, async (url) => {
    const page = await context.newPage()
    try {
      const nav = await gotoSettled(page, url, { settleMs, waitSelector: values['wait-selector'] })
      if (!nav.ok) {
        return { url, navOk: false, status: nav.status, navError: nav.error || null, consent: null, axe: null }
      }
      let consent = { dismissed: false, how: null }
      if (values['dismiss-consent']) {
        consent = await dismissConsent(page, values['consent-selector'])
        if (consent.dismissed) anyConsentDismissed = true
      }
      let axe = null
      try {
        axe = await runAxeOnPage(page, { level, include: values.include, exclude: values.exclude })
        log(`axe: ${url} -> ${axe.violationCount} regels overtreden`)
      } catch (err) {
        return { url, navOk: true, status: nav.status, navError: `axe-fout: ${err.message}`, consent, axe: null }
      }
      let htmlcs = null
      if (htmlcsEnabled) {
        try {
          htmlcs = await runHtmlcsOnPage(page, { level })
          log(`htmlcs: ${url} -> ${htmlcs.errorCount} errors`)
        } catch (err) {
          log(`htmlcs overgeslagen op ${url}: ${err.message}`)
        }
      }
      return { url, navOk: true, status: nav.status, navError: null, consent, axe, htmlcs }
    } finally {
      await page.close().catch(() => {})
      if (throttle > 0) await new Promise((r) => setTimeout(r, throttle))
    }
  })
  await close()

  // --- lighthouse pass (best-effort) ---
  let lighthouse = { available: false, pages: {} }
  let lighthouseSkippedReason = null
  const navigableUrls = pageResults.filter((p) => p.navOk).map((p) => p.url)
  if (lighthouseEnabled && navigableUrls.length) {
    log(`lighthouse: ${navigableUrls.length} pagina's…`)
    lighthouse = await runLighthouse(navigableUrls, { throttleMs: throttle }, log)
    if (!lighthouse.available) {
      lighthouseSkippedReason = lighthouse.reason || 'onbekende reden'
      log(`lighthouse overgeslagen: ${lighthouseSkippedReason}`)
    }
  } else if (!lighthouseEnabled) {
    lighthouseSkippedReason = 'uitgeschakeld met --no-lighthouse'
  }

  // --- merge + report ---
  const scanConditions = {
    consentRequested: Boolean(values['dismiss-consent']),
    anyConsentDismissed,
    auth: Boolean(values['auth-state'] || values['basic-auth']),
    settleMs,
  }
  const merged = mergeResults(pageResults, lighthouse, { skipped, source, truncated, scanConditions })
  merged.lighthouseSkippedReason = lighthouseSkippedReason

  const date = isoDate()
  const meta = {
    baseUrl,
    host: new URL(baseUrl).host,
    level,
    date,
    engines: {
      axe: status.results.packages['axe-core'].version || status.results.packages['@axe-core/playwright'].version || '?',
      htmlcs: htmlcsEnabled && status.results.packages['html_codesniffer'].ok ? status.results.packages['html_codesniffer'].version : null,
      lighthouse: lighthouse.available ? status.results.packages.lighthouse.version || '?' : null,
    },
  }
  const report = buildReport(merged, meta)

  if (values.stdout) {
    process.stdout.write(JSON.stringify(report.json, null, 2) + '\n')
  } else {
    const outDir = resolveOutDir(values.out)
    const written = writeReport(outDir, baseUrl, report, values.format || 'all', date)
    log('rapport geschreven:')
    for (const p of written) log('  ' + p)
  }

  // --- summary + exit code ---
  const { counts, scores } = merged
  log(
    `klaar — composite ${scores.composite ?? '—'}/100 · ` +
      `P0 ${counts.P0} · P1 ${counts.P1} · P2 ${counts.P2} · P3 ${counts.P3}`
  )
  const thresholdRank = SEVERITY_RANK[failOn] ?? 1
  const failing = Object.entries(counts).some(([sev, n]) => n > 0 && SEVERITY_RANK[sev] <= thresholdRank)
  return failing ? 1 : 0
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[a11y-scan] fatale fout:', err)
    process.exit(2)
  })
