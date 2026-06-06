// Combine the axe pass + Lighthouse pass into one normalised result set:
// group findings into actionable issues, de-duplicate axe vs Lighthouse,
// and compute the composite health score.

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

/**
 * @param {Array<{url, navOk, status, consent, axe, navError}>} pageResults
 * @param {{available:boolean, pages:object, reason?:string}} lighthouse
 * @param {object} extra { skipped, source, truncated, scanConditions }
 */
export function mergeResults(pageResults, lighthouse, extra = {}) {
  // --- 1. group axe + htmlcs findings into issues keyed by ruleId ---
  const issueMap = new Map() // ruleId -> issue
  const axeRuleIdsByPage = new Map() // pageUrl -> Set(ruleId)

  const addFinding = (f) => {
    let issue = issueMap.get(f.ruleId)
    if (!issue) {
      issue = {
        engine: f.engine,
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
  }

  for (const pr of pageResults) {
    if (pr.axe) {
      const set = axeRuleIdsByPage.get(pr.url) || new Set()
      for (const f of pr.axe.findings) {
        set.add(f.ruleId)
        addFinding(f)
      }
      axeRuleIdsByPage.set(pr.url, set)
    }
    if (pr.htmlcs) {
      for (const f of pr.htmlcs.findings) addFinding(f)
    }
  }

  // --- 2. add Lighthouse-only failed audits (deduped vs axe per page) ---
  if (lighthouse && lighthouse.available) {
    for (const [url, lh] of Object.entries(lighthouse.pages)) {
      const axeRules = axeRuleIdsByPage.get(url) || new Set()
      for (const a of lh.failedAudits || []) {
        if (axeRules.has(a.id)) continue // already reported by axe
        if (issueMap.has(a.id) && issueMap.get(a.id).engine === 'axe') {
          // same rule seen by axe on another page — attach instance, keep axe metadata
          issueMap.get(a.id).instances.push({ page: url, selector: '', snippet: '' })
          continue
        }
        let issue = issueMap.get(a.id)
        if (!issue) {
          issue = {
            engine: 'lighthouse',
            ruleId: a.id,
            severity: 'P2', // Lighthouse gives no impact level
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

  // --- 2.5 cross-engine confirmation ---
  // axe and htmlcs both emit WCAG success criteria, so an issue is "confirmed"
  // when ≥2 engines flag the same SC on the same page. Single-engine issues are
  // flagged for manual verification (each engine has its own false positives).
  const wcagPageEngines = new Map() // `${sc}|${page}` -> Set(engine)
  for (const pr of pageResults) {
    const all = [...(pr.axe ? pr.axe.findings : []), ...(pr.htmlcs ? pr.htmlcs.findings : [])]
    for (const f of all) {
      for (const sc of f.wcag) {
        const key = `${sc}|${f.page}`
        if (!wcagPageEngines.has(key)) wcagPageEngines.set(key, new Set())
        wcagPageEngines.get(key).add(f.engine)
      }
    }
  }
  for (const issue of issueMap.values()) {
    const engines = new Set([issue.engine])
    const pages = new Set(issue.instances.map((i) => i.page))
    for (const sc of issue.wcag) {
      for (const page of pages) {
        const s = wcagPageEngines.get(`${sc}|${page}`)
        if (s) for (const e of s) engines.add(e)
      }
    }
    issue.engines = [...engines].sort()
    issue.crossConfirmed = issue.engines.length >= 2
  }

  const issues = [...issueMap.values()].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      Number(b.crossConfirmed) - Number(a.crossConfirmed) ||
      b.instances.length - a.instances.length
  )
  const crossConfirmedCount = issues.filter((i) => i.crossConfirmed).length

  // --- 3. counts ---
  const counts = { P0: 0, P1: 0, P2: 0, P3: 0 }
  let totalInstances = 0
  for (const issue of issues) {
    counts[issue.severity] = (counts[issue.severity] || 0) + 1
    totalInstances += issue.instances.length
  }

  // --- 4. scores ---
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

  // composite: LH 0.4 / axe 0.4 / manual 0.2 — renormalise over present parts.
  // The standalone script has no manual input (filled in by the skill flow).
  const parts = []
  if (lighthouseAvg != null) parts.push({ w: 0.4, v: lighthouseAvg })
  if (axePassRate != null) parts.push({ w: 0.4, v: axePassRate })
  const totalW = parts.reduce((a, p) => a + p.w, 0)
  const composite = totalW > 0 ? Math.round(parts.reduce((a, p) => a + p.w * p.v, 0) / totalW) : null

  return {
    issues,
    counts,
    totalInstances,
    crossConfirmedCount,
    scores: {
      lighthouseAvg,
      axePassRate,
      manual: null, // filled in by the skill's manual checklist walkthrough
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
