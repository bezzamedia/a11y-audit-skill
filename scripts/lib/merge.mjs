// Combine the engines into one result set.
//
// Wiring is benchmark-driven (see benchmark/FINDINGS.md): on the W3C ACT suite,
// axe-core alone scores precision 87% / recall 46%, while treating HTMLCS as an
// equal source dropped precision to 70% for ~2pp of recall. So:
//   - axe (+ Lighthouse-only audits) are the primary, P0–P3-counted findings.
//   - HTMLCS is used to CONFIRM axe findings (the cross-confirmed subset scored
//     91% precision) and is otherwise demoted to a separate "second opinion"
//     list that does NOT feed the counts, the score, or the CI gate.

import { SEVERITY_ORDER } from './util.mjs'

const SEVERITY_RANK = { P0: 0, P1: 1, P2: 2, P3: 3 }

function band(score) {
  if (score == null) return 'n.v.t.'
  if (score >= 90) return 'Uitstekend'
  if (score >= 75) return 'Goed'
  if (score >= 60) return 'Acceptabel'
  if (score >= 40) return 'Matig'
  return 'Kritiek'
}

export function mergeResults(pageResults, lighthouse, extra = {}) {
  const issueMap = new Map() // ruleId -> primary issue (axe / lighthouse)
  const axeScPage = new Set() // `${sc}|${page}` covered by axe
  const axeRuleIdsByPage = new Map()

  // --- 1. axe findings (primary, P-counted) ---
  for (const pr of pageResults) {
    if (!pr.axe) continue
    axeRuleIdsByPage.set(pr.url, new Set(pr.axe.findings.map((f) => f.ruleId)))
    for (const f of pr.axe.findings) {
      let issue = issueMap.get(f.ruleId)
      if (!issue) {
        issue = {
          engine: 'axe',
          ruleId: f.ruleId,
          severity: f.severity,
          wcag: f.wcag,
          help: f.help,
          description: f.description,
          helpUrl: f.helpUrl,
          instances: [],
        }
        issueMap.set(f.ruleId, issue)
      }
      issue.instances.push({ page: f.page, selector: f.selector, snippet: f.snippet })
      for (const sc of f.wcag) axeScPage.add(`${sc}|${f.page}`)
    }
  }

  // --- 2. Lighthouse-only audits (P-counted), deduped vs axe per page ---
  if (lighthouse && lighthouse.available) {
    for (const [url, lh] of Object.entries(lighthouse.pages)) {
      const axeRules = axeRuleIdsByPage.get(url) || new Set()
      for (const a of lh.failedAudits || []) {
        if (axeRules.has(a.id)) continue
        let issue = issueMap.get(a.id)
        if (!issue) {
          issue = {
            engine: 'lighthouse',
            ruleId: a.id,
            severity: 'P2',
            wcag: [],
            help: a.title,
            description: a.description || '',
            helpUrl: '',
            instances: [],
          }
          issueMap.set(a.id, issue)
        }
        issue.instances.push({ page: url, selector: '', snippet: '' })
      }
    }
  }

  // --- 3. HTMLCS: confirm axe findings + collect HTMLCS-only as "second opinion" ---
  const htmlcsScPage = new Set()
  const secondMap = new Map()
  for (const pr of pageResults) {
    if (!pr.htmlcs) continue
    for (const f of pr.htmlcs.findings) {
      for (const sc of f.wcag) htmlcsScPage.add(`${sc}|${f.page}`)
      const coveredByAxe = f.wcag.some((sc) => axeScPage.has(`${sc}|${f.page}`))
      if (coveredByAxe) continue // used only to confirm the axe finding
      let issue = secondMap.get(f.ruleId)
      if (!issue) {
        issue = {
          engine: 'htmlcs',
          ruleId: f.ruleId,
          wcag: f.wcag,
          help: f.help,
          helpUrl: f.helpUrl,
          instances: [],
        }
        secondMap.set(f.ruleId, issue)
      }
      issue.instances.push({ page: f.page, selector: f.selector, snippet: f.snippet })
    }
  }

  // confirm flag on axe issues (Lighthouse issues stay single-source)
  for (const issue of issueMap.values()) {
    if (issue.engine !== 'axe') {
      issue.crossConfirmed = false
      issue.engines = [issue.engine]
      continue
    }
    const pages = new Set(issue.instances.map((i) => i.page))
    let confirmed = false
    for (const sc of issue.wcag) {
      for (const page of pages) {
        if (htmlcsScPage.has(`${sc}|${page}`)) confirmed = true
      }
    }
    issue.crossConfirmed = confirmed
    issue.engines = confirmed ? ['axe', 'htmlcs'] : ['axe']
  }

  const issues = [...issueMap.values()].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      Number(b.crossConfirmed) - Number(a.crossConfirmed) ||
      b.instances.length - a.instances.length
  )
  const secondOpinion = [...secondMap.values()].sort((a, b) => b.instances.length - a.instances.length)

  // --- counts/scores from the PRIMARY issues only ---
  const counts = { P0: 0, P1: 0, P2: 0, P3: 0 }
  let totalInstances = 0
  for (const issue of issues) {
    counts[issue.severity] = (counts[issue.severity] || 0) + 1
    totalInstances += issue.instances.length
  }
  const crossConfirmedCount = issues.filter((i) => i.crossConfirmed).length

  const lhScores = []
  if (lighthouse && lighthouse.available) {
    for (const lh of Object.values(lighthouse.pages)) {
      if (typeof lh.score === 'number') lhScores.push(lh.score)
    }
  }
  const lighthouseAvg = lhScores.length ? Math.round(lhScores.reduce((a, b) => a + b, 0) / lhScores.length) : null

  const passRates = []
  for (const pr of pageResults) {
    if (!pr.axe) continue
    const denom = pr.axe.passCount + pr.axe.violationCount
    passRates.push(denom === 0 ? 100 : (pr.axe.passCount / denom) * 100)
  }
  const axePassRate = passRates.length ? Math.round(passRates.reduce((a, b) => a + b, 0) / passRates.length) : null

  const parts = []
  if (lighthouseAvg != null) parts.push({ w: 0.4, v: lighthouseAvg })
  if (axePassRate != null) parts.push({ w: 0.4, v: axePassRate })
  const totalW = parts.reduce((a, p) => a + p.w, 0)
  const composite = totalW > 0 ? Math.round(parts.reduce((a, p) => a + p.w * p.v, 0) / totalW) : null

  return {
    issues,
    secondOpinion,
    counts,
    totalInstances,
    crossConfirmedCount,
    scores: {
      lighthouseAvg,
      axePassRate,
      manual: null,
      composite,
      compositeBand: band(composite),
    },
    pages: pageResults.map((pr) => ({
      url: pr.url,
      status: pr.status,
      navOk: pr.navOk,
      consentDismissed: pr.consent?.dismissed || false,
      axeViolations: pr.axe ? pr.axe.violationCount : null,
      htmlcsErrors: pr.htmlcs ? pr.htmlcs.errorCount : null,
      lighthouseScore: lighthouse?.pages?.[pr.url]?.score ?? null,
      navError: pr.navError || null,
    })),
    severityOrder: SEVERITY_ORDER,
    ...extra,
  }
}
