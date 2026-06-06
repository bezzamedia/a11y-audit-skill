#!/usr/bin/env node
// Part A — run the W3C ACT Rules test cases through our two engines and measure
// how well we agree with the expected outcomes. The point is an objective,
// reproducible coverage/precision number, AND a direct test of our headline
// claim: does cross-engine confirmation ("both") actually improve precision?
//
// Method (documented honestly): for each WCAG-mapped test case we check whether
// our scanner reports a violation on any of the rule's WCAG success criteria.
// This is SC-level, not exact-rule-level — but ACT test cases are minimal,
// single-issue snippets, so the approximation is tight. Non-WCAG rules
// (ARIA/technique-only) are skipped and reported as such.

import { parseArgs } from 'node:util'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

import { launchAxeBrowser, gotoSettled } from '../scripts/lib/browser.mjs'
import { runAxeOnPage } from '../scripts/lib/run-axe.mjs'
import { runHtmlcsOnPage } from '../scripts/lib/run-htmlcs.mjs'
import { pool, isoDate } from '../scripts/lib/util.mjs'
import { fetchTestcases, wcagFromRequirements } from './lib/act.mjs'
import { newCounts, classify, derive, pct } from './lib/metrics.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RESULTS = path.join(HERE, 'results')
const log = (...a) => console.error('[act]', ...a)

const { values } = parseArgs({
  options: {
    limit: { type: 'string' },
    all: { type: 'boolean' },
    rule: { type: 'string' },
    level: { type: 'string' },
    concurrency: { type: 'string' },
  },
})

const level = (values.level || 'AA').toUpperCase()
const concurrency = Number(values.concurrency || 6)

const { data, cached } = await fetchTestcases(RESULTS)
log(`testcases.json: ${data.testcases.length} cases (${cached ? 'cache' : 'vers opgehaald'})`)

let cases = data.testcases
  .map((t) => ({ ...t, scs: wcagFromRequirements(t.ruleAccessibilityRequirements) }))
  .filter((t) => t.scs.length > 0) // only WCAG-mapped rules
const wcagMapped = cases.length
const skipped = data.testcases.length - wcagMapped

if (values.rule) cases = cases.filter((t) => t.ruleId === values.rule)
const totalAvailable = cases.length
if (!values.all) cases = cases.slice(0, Number(values.limit || 200))

log(`${cases.length}/${totalAvailable} WCAG-gemapte cases · WCAG ${level} · concurrency ${concurrency}`)

const { context, close } = await launchAxeBrowser({})
let done = 0
const results = await pool(cases, concurrency, async (tc) => {
  const page = await context.newPage()
  try {
    const nav = await gotoSettled(page, tc.url, { settleMs: 120 })
    if (!nav.ok) return { tc, error: `nav ${nav.status}`, axeSCs: [], htmlcsSCs: [] }
    let axeSCs = []
    let htmlcsSCs = []
    try {
      const a = await runAxeOnPage(page, { level })
      axeSCs = [...new Set(a.findings.flatMap((f) => f.wcag))]
    } catch (e) {
      /* engine error on this case — treated as "flagged nothing" */
    }
    try {
      const h = await runHtmlcsOnPage(page, { level })
      htmlcsSCs = [...new Set(h.findings.flatMap((f) => f.wcag))]
    } catch (e) {
      /* ignore */
    }
    return { tc, axeSCs, htmlcsSCs }
  } finally {
    await page.close().catch(() => {})
    if (++done % 50 === 0) log(`${done}/${cases.length}`)
  }
})
await close()

// --- classify into four variants ---
const variants = { axe: newCounts(), htmlcs: newCounts(), either: newCounts(), both: newCounts() }
const perSc = new Map() // sc -> {fail, caught}  (recall per SC, union engine)
const ruleOk = new Map() // ruleId -> {name, consistent}
let navErrors = 0

for (const r of results) {
  if (r.error) {
    navErrors++
    continue
  }
  const rel = new Set(r.tc.scs)
  const inAxe = r.axeSCs.some((s) => rel.has(s))
  const inHtmlcs = r.htmlcsSCs.some((s) => rel.has(s))
  const expectedFail = r.tc.expected === 'failed'

  classify(variants.axe, expectedFail, inAxe)
  classify(variants.htmlcs, expectedFail, inHtmlcs)
  classify(variants.either, expectedFail, inAxe || inHtmlcs)
  classify(variants.both, expectedFail, inAxe && inHtmlcs)

  // per-SC recall (only "failed" cases) on the union engine
  if (expectedFail) {
    for (const sc of r.tc.scs) {
      const e = perSc.get(sc) || { fail: 0, caught: 0 }
      e.fail++
      if (inAxe || inHtmlcs) e.caught++
      perSc.set(sc, e)
    }
  }

  // ACT-style rule consistency on the union engine
  const correct = expectedFail ? inAxe || inHtmlcs : !(inAxe || inHtmlcs)
  const ro = ruleOk.get(r.tc.ruleId) || { name: r.tc.ruleName, consistent: true }
  if (!correct) ro.consistent = false
  ruleOk.set(r.tc.ruleId, ro)
}

const consistentRules = [...ruleOk.values()].filter((r) => r.consistent).length
const totalRules = ruleOk.size

// --- report ---
const date = isoDate()
const row = (name, c) => {
  const d = derive(c)
  return `| ${name} | ${c.TP} | ${c.FP} | ${c.FN} | ${c.TN} | ${pct(d.precision)} | ${pct(d.recall)} | ${pct(d.f1)} |`
}

const missedScs = [...perSc.entries()]
  .map(([sc, e]) => ({ sc, ...e, recall: e.caught / e.fail }))
  .sort((a, b) => a.recall - b.recall)

const md = []
md.push(`# ACT Rules benchmark — onze scanner — ${date}`)
md.push('')
md.push(
  `Bron: [W3C ACT Rules test cases](https://act-rules.github.io/testcases.json) · ` +
    `${cases.length} WCAG-gemapte cases getest (van ${wcagMapped} beschikbaar; ${skipped} niet-WCAG cases overgeslagen).` +
    (navErrors ? ` ${navErrors} cases niet geladen.` : '')
)
md.push('')
md.push('## Engine-varianten (precisie vs recall)')
md.push('')
md.push('| Variant | TP | FP | FN | TN | Precisie | Recall | F1 |')
md.push('|---|---|---|---|---|---|---|---|')
md.push(row('axe alleen', variants.axe))
md.push(row('HTMLCS alleen', variants.htmlcs))
md.push(row('union (axe **of** HTMLCS)', variants.either))
md.push(row('cross-confirmed (axe **én** HTMLCS)', variants.both))
md.push('')
md.push(
  '**Interpretatie.** "union" maximaliseert recall (vangt het meest), "cross-confirmed" zou ' +
    'hoger op precisie moeten scoren (minder false positives). Vergelijk die twee om te zien of ' +
    'de cross-engine-bevestiging zijn plek verdient.'
)
md.push('')
md.push(`## ACT-regel-consistentie`)
md.push('')
md.push(
  `${consistentRules}/${totalRules} geteste regels volledig consistent op de union-engine ` +
    `(alle failed-cases gevangen én geen passed/inapplicable-case onterecht gevlagd).`
)
md.push('')
md.push('## Dekking per WCAG-SC (recall op failed-cases, union)')
md.push('')
md.push('| WCAG-SC | failed-cases | gevangen | recall |')
md.push('|---|---|---|---|')
for (const m of missedScs) md.push(`| ${m.sc} | ${m.fail} | ${m.caught} | ${pct(m.recall)} |`)
md.push('')
md.push('## Methode & kanttekeningen')
md.push('')
md.push(
  '- SC-niveau-benadering: we tellen een case als "gevangen" als onze scanner een overtreding ' +
    'meldt op één van de WCAG-SCs van de regel. ACT-cases zijn minimale, enkelvoudige snippets, ' +
    'dus dit ligt dicht bij regel-niveau, maar is niet identiek.'
)
md.push('- Niet-WCAG-regels (alleen WAI-ARIA/techniek) zijn overgeslagen; die targeten onze engines niet.')
md.push(
  '- Veel WCAG-SCs zijn principieel niet automatiseerbaar (media, timing, betekenis). Lage recall ' +
    'daar is verwacht en correct — dat is precies wat de handmatige checklist afdekt.'
)
md.push(`- Engines: axe-core + HTML_CodeSniffer, WCAG ${level}. Datum: ${date}.`)
md.push('')

fs.mkdirSync(RESULTS, { recursive: true })
const stem = path.join(RESULTS, `act-benchmark-${date}`)
fs.writeFileSync(`${stem}.md`, md.join('\n'))
fs.writeFileSync(
  `${stem}.json`,
  JSON.stringify(
    { date, level, casesRun: cases.length, wcagMapped, skipped, navErrors, variants, consistentRules, totalRules, perSc: Object.fromEntries(perSc) },
    null,
    2
  )
)

const d = derive(variants.either)
log(`klaar — union recall ${pct(d.recall)}, precisie ${pct(d.precision)} · ${consistentRules}/${totalRules} regels consistent`)
log(`rapport: ${stem}.md`)
