#!/usr/bin/env node
// Part B — head-to-head on real URLs: our scanner vs Pa11y vs axe-cli vs
// Lighthouse. This is INDICATIVE, not a precision benchmark — tools count
// issues differently (instances vs rules vs messages), so we report raw counts,
// a normalised "distinct WCAG SC" count where derivable, and runtime. For a
// rigorous accuracy measure use act-runner.mjs (Part A).
//
// Usage: node compare-runner.mjs <url> [url2 ...] [--level AA]

import { parseArgs } from 'node:util'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

// Resolve a chromedriver binary that matches the locally installed Chrome.
const require = createRequire(import.meta.url)
let CHROMEDRIVER_PATH = null
try {
  CHROMEDRIVER_PATH = require('chromedriver').path
} catch {
  /* axe-cli will fall back to its bundled driver */
}

import { launchAxeBrowser, gotoSettled } from '../scripts/lib/browser.mjs'
import { runAxeOnPage } from '../scripts/lib/run-axe.mjs'
import { runHtmlcsOnPage } from '../scripts/lib/run-htmlcs.mjs'
import { runLighthouse } from '../scripts/lib/run-lighthouse.mjs'
import { parseWcagTags, axeTagsForLevel, isoDate } from '../scripts/lib/util.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RESULTS = path.join(HERE, 'results')
const BIN = path.join(HERE, 'node_modules', '.bin')
const log = (...a) => console.error('[compare]', ...a)

const { values, positionals } = parseArgs({ allowPositionals: true, options: { level: { type: 'string' } } })
const level = (values.level || 'AA').toUpperCase()
const urls = positionals.filter((u) => /^https?:\/\//.test(u))
if (!urls.length) {
  console.error('Geef minstens één URL: node compare-runner.mjs https://example.com [meer-urls]')
  process.exit(2)
}

/** Run a command, never throw; resolve {stdout, stderr, code}. */
function run(cmd, args, timeoutMs = 120000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ stdout: stdout || '', stderr: stderr || '', code: err ? err.code ?? 1 : 0 })
    })
  })
}

const now = () => Number(process.hrtime.bigint() / 1000000n)

/** WCAG SC from an HTMLCS-style code, e.g. ...1_4_3.G18.Fail -> "1.4.3". */
function scFromHtmlcsCode(code) {
  const m = /\.(\d+)_(\d+)_(\d+)\./.exec(code || '')
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null
}

async function ours(context, url) {
  const t0 = now()
  const page = await context.newPage()
  const out = { tool: 'onze scanner (axe+HTMLCS)', issues: 0, scs: new Set(), note: '' }
  try {
    const nav = await gotoSettled(page, url, { settleMs: 600 })
    if (!nav.ok) {
      out.note = `nav ${nav.status}`
      return { ...out, scs: [...out.scs], ms: now() - t0 }
    }
    const a = await runAxeOnPage(page, { level }).catch(() => ({ findings: [] }))
    const h = await runHtmlcsOnPage(page, { level }).catch(() => ({ findings: [] }))
    const findings = [...a.findings, ...h.findings]
    out.issues = findings.length
    findings.flatMap((f) => f.wcag).forEach((s) => out.scs.add(s))
  } finally {
    await page.close().catch(() => {})
  }
  return { ...out, scs: [...out.scs], ms: now() - t0 }
}

async function pa11y(url) {
  const t0 = now()
  const out = { tool: 'Pa11y', issues: 0, scs: new Set(), note: '' }
  const bin = path.join(BIN, 'pa11y')
  if (!fs.existsSync(bin)) return { ...out, scs: [], ms: 0, note: 'niet geïnstalleerd (npm install in benchmark/)' }
  const { stdout, code } = await run(bin, ['--reporter', 'json', '--standard', `WCAG2${level}`, url])
  try {
    const arr = JSON.parse(stdout)
    const errors = arr.filter((i) => i.type === 'error')
    out.issues = errors.length
    for (const i of errors) {
      const sc = scFromHtmlcsCode(i.code)
      if (sc) out.scs.add(sc)
    }
  } catch {
    out.note = `kon output niet parsen (exit ${code})`
  }
  return { ...out, scs: [...out.scs], ms: now() - t0 }
}

async function axeCli(url) {
  const t0 = now()
  const out = { tool: 'axe-cli', issues: 0, scs: new Set(), note: '' }
  const bin = path.join(BIN, 'axe')
  if (!fs.existsSync(bin)) return { ...out, scs: [], ms: 0, note: 'niet geïnstalleerd' }
  // axe-cli's --save is a filename joined onto --dir; absolute paths don't work.
  const dir = os.tmpdir()
  const fname = `axecli-${Date.now()}.json`
  const tmp = path.join(dir, fname)
  const args = [url, '--dir', dir, '--save', fname, '--tags', axeTagsForLevel(level).join(',')]
  if (CHROMEDRIVER_PATH) args.push('--chromedriver-path', CHROMEDRIVER_PATH)
  const { code, stderr } = await run(bin, args)
  try {
    const data = JSON.parse(fs.readFileSync(tmp, 'utf8'))
    const pages = Array.isArray(data) ? data : [data]
    for (const p of pages) {
      for (const v of p.violations || []) {
        out.issues += (v.nodes || []).length || 1
        for (const sc of parseWcagTags(v.tags || [])) out.scs.add(sc)
      }
    }
    fs.unlinkSync(tmp)
  } catch {
    out.note = `kon niet draaien (vereist lokale Chrome/driver) — ${(stderr || '').split('\n')[0].slice(0, 80)}`
  }
  return { ...out, scs: [...out.scs], ms: now() - t0 }
}

async function lighthouse(url) {
  const t0 = now()
  const out = { tool: 'Lighthouse', issues: 0, scs: new Set(), note: '' }
  const res = await runLighthouse([url], {})
  if (!res.available) return { ...out, scs: [], ms: now() - t0, note: res.reason || 'niet beschikbaar' }
  const lh = res.pages[url]
  out.issues = (lh?.failedAudits || []).length
  out.note = lh?.score != null ? `score ${lh.score}/100` : ''
  return { ...out, scs: [...out.scs], ms: now() - t0 }
}

// --- run all tools per URL ---
const { context, close } = await launchAxeBrowser({})
const perUrl = []
for (const url of urls) {
  log(`URL: ${url}`)
  const oursR = await ours(context, url)
  log(`  onze scanner: ${oursR.issues} bevindingen, ${oursR.scs.length} SCs, ${oursR.ms}ms`)
  const pa11yR = await pa11y(url)
  log(`  pa11y: ${pa11yR.issues} (${pa11yR.note || 'ok'})`)
  const axeR = await axeCli(url)
  log(`  axe-cli: ${axeR.issues} (${axeR.note || 'ok'})`)
  const lhR = await lighthouse(url)
  log(`  lighthouse: ${lhR.issues} failed audits (${lhR.note})`)
  perUrl.push({ url, tools: [oursR, pa11yR, axeR, lhR] })
}
await close()

// --- report ---
const date = isoDate()
const md = []
md.push(`# Head-to-head benchmark — ${date}`)
md.push('')
md.push(
  '> Indicatief, geen precisie-benchmark. Tools tellen anders (instanties vs regels vs meldingen). ' +
    'Vergelijk vooral **distinct WCAG-SCs** en looptijd. Voor accuratesse: zie `act-benchmark-*.md`.'
)
md.push('')
for (const u of perUrl) {
  md.push(`## ${u.url}`)
  md.push('')
  md.push('| Tool | Bevindingen (ruw) | Distinct WCAG-SCs | Tijd | Notitie |')
  md.push('|---|---|---|---|---|')
  for (const t of u.tools) {
    md.push(`| ${t.tool} | ${t.issues} | ${t.scs.length} | ${(t.ms / 1000).toFixed(1)}s | ${t.note || ''} |`)
  }
  // SCs uniquely found by us vs the union of the other scanners
  const oursScs = new Set(u.tools[0].scs)
  const othersScs = new Set(u.tools.slice(1).flatMap((t) => t.scs))
  const onlyOurs = [...oursScs].filter((s) => !othersScs.has(s))
  const onlyOthers = [...othersScs].filter((s) => !oursScs.has(s))
  md.push('')
  md.push(`- WCAG-SCs alleen door onze scanner gevonden: ${onlyOurs.length ? onlyOurs.join(', ') : '—'}`)
  md.push(`- WCAG-SCs alleen door andere tools gevonden: ${onlyOthers.length ? onlyOthers.join(', ') : '—'}`)
  md.push('')
}
md.push('## Kanttekeningen')
md.push('')
md.push('- "Bevindingen (ruw)" is niet 1:1 vergelijkbaar tussen tools; gebruik distinct WCAG-SCs als eerlijkere maat.')
md.push('- axe-cli vereist een lokale Chrome + chromedriver; faalt die, dan staat dat in de notitie.')
md.push('- Pa11y draait standaard de HTMLCS-runner (dezelfde engine als onze tweede engine).')
md.push('- Onze scanner en Lighthouse delen axe-core; overlap is dus verwacht.')
md.push('')

fs.mkdirSync(RESULTS, { recursive: true })
const stem = path.join(RESULTS, `compare-benchmark-${date}`)
fs.writeFileSync(`${stem}.md`, md.join('\n'))
fs.writeFileSync(`${stem}.json`, JSON.stringify({ date, level, perUrl }, null, 2))
log(`klaar — rapport: ${stem}.md`)
