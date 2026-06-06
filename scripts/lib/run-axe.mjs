// Run axe-core (via @axe-core/playwright) against a live, hydrated page and
// normalise its violations into the scanner's finding shape.

import { impactToSeverity, parseWcagTags, axeTagsForLevel } from './util.mjs'

// @axe-core/playwright is imported lazily (see browser.mjs note).

/**
 * @param {import('playwright').Page} page
 * @param {{level?:string, include?:string[], exclude?:string[]}} opts
 * @returns {Promise<{violations:any[], passCount:number, violationCount:number,
 *                    incompleteCount:number, findings:object[]}>}
 */
export async function runAxeOnPage(page, opts = {}) {
  const { AxeBuilder } = await import('@axe-core/playwright')
  const builder = new AxeBuilder({ page }).withTags(axeTagsForLevel(opts.level))

  for (const sel of opts.include || []) builder.include(sel)
  for (const sel of opts.exclude || []) builder.exclude(sel)

  const results = await builder.analyze()
  const pageUrl = page.url()

  const findings = []
  for (const v of results.violations) {
    const wcag = parseWcagTags(v.tags)
    const severity = impactToSeverity(v.impact)
    for (const node of v.nodes) {
      findings.push({
        engine: 'axe',
        ruleId: v.id,
        wcag,
        severity,
        impact: v.impact || 'unknown',
        help: v.help,
        description: v.description,
        helpUrl: v.helpUrl,
        page: pageUrl,
        selector: Array.isArray(node.target) ? node.target.join(' ') : String(node.target || ''),
        snippet: (node.html || '').slice(0, 240),
        failureSummary: node.failureSummary || '',
      })
    }
  }

  return {
    violations: results.violations,
    passCount: results.passes.length,
    violationCount: results.violations.length,
    incompleteCount: results.incomplete.length,
    findings,
  }
}
