// Build the JSON (source of truth) + Markdown report, and write them to disk.
// Markdown mirrors the sibling `audit`/`spec-audit` skills: health score,
// findings grouped P0–P3, "Niet getoetst", limitations. Dutch by default.

import fs from 'node:fs'
import path from 'node:path'
import { slugHost, isoDate } from './util.mjs'

const SEVERITY_LABEL = {
  P0: 'P0 — Kritiek (blokkeert gebruik met hulptechnologie)',
  P1: 'P1 — Ernstig (WCAG AA-overtreding, fix vóór release)',
  P2: 'P2 — Matig (probleem met workaround)',
  P3: 'P3 — Klein (afwerking)',
}

const LIMITATIONS = [
  'Geautomatiseerde scans vangen ~30–50% van alle WCAG-criteria. De handmatige checklist is verplicht, niet optioneel.',
  'Kleurcontrast op afbeeldingen, gradients en tekst-over-beeld wordt niet betrouwbaar gemeten — controleer handmatig.',
  'Dynamische/stateful UI (modals, foutmeldingen, uitgeklapte menu\'s, toasts) wordt alleen getoetst als die in de DOM staat tijdens de scan.',
  'Cross-origin iframes (kaarten, video, betaal-widgets) worden niet door axe doorzocht.',
  'Live productiesites kunnen rate-limiten; een WAF kan headless Chromium blokkeren (403 → "niet getoetst").',
  'PDF en niet-HTML-bestanden vallen buiten scope.',
]

function scoreRow(label, value, suffix = '') {
  return `| ${label} | ${value == null ? '—' : value + suffix} |`
}

function buildMarkdown(merged, meta) {
  const date = meta.date || isoDate()
  const lh = meta.engines.lighthouse ? `Lighthouse ${meta.engines.lighthouse}` : 'Lighthouse (uit)'
  const hc = meta.engines.htmlcs ? `HTMLCS ${meta.engines.htmlcs}` : 'HTMLCS (uit)'
  const lines = []

  lines.push(`# Accessibility Audit — ${meta.host} — ${date}`)
  lines.push('')
  lines.push(
    `**Doel:** ${meta.baseUrl}  ·  **Scope:** ${merged.pages.length} pagina's · WCAG ${meta.level}  ·  ` +
      `**Engines:** axe-core ${meta.engines.axe}, ${hc}, ${lh}`
  )
  const c = merged.scanConditions || {}
  lines.push(
    `**Scan-condities:** consent ${c.consentRequested ? (c.anyConsentDismissed ? 'gesloten' : 'niet gevonden') : 'niet behandeld'}` +
      ` · auth ${c.auth ? 'ja' : 'nee'} · settle ${c.settleMs}ms · discovery: ${merged.source}` +
      (merged.truncated ? ` · ⚠ ${merged.truncated} pagina's afgekapt door --max-pages` : '')
  )
  lines.push('')

  // --- health score ---
  const s = merged.scores
  lines.push('## Health Score')
  lines.push('')
  lines.push('| Bron | Score |')
  lines.push('|---|---|')
  lines.push(scoreRow('Lighthouse a11y (gem.)', s.lighthouseAvg, '/100'))
  lines.push(scoreRow('axe pass-rate', s.axePassRate, '%'))
  lines.push('| Handmatige checklist | nog niet ingevuld |')
  lines.push(`| **Composite (automatisch)** | **${s.composite == null ? '—' : s.composite + '/100'} — ${s.compositeBand}** |`)
  lines.push('')
  lines.push(
    `**Severity:** P0 ${merged.counts.P0} · P1 ${merged.counts.P1} · P2 ${merged.counts.P2} · P3 ${merged.counts.P3}` +
      `  ·  totaal ${merged.totalInstances} instanties`
  )
  lines.push('')
  lines.push(
    `**Cross-engine:** ${merged.crossConfirmedCount} van ${merged.issues.length} axe-bevindingen zijn ook door HTMLCS bevestigd (✓ high-confidence). ` +
      `HTMLCS-only meldingen staan apart onder "Tweede mening" en tellen niet mee in de score, P-telling of CI-gate.`
  )
  lines.push('')
  lines.push('> ⚠️ Geautomatiseerde scans dekken ~30–50% van WCAG. Een hoge score zonder ingevulde handmatige checklist betekent **niet** "toegankelijk".')
  lines.push('')

  // --- executive summary ---
  lines.push('## Samenvatting')
  lines.push('')
  const top = merged.issues.slice(0, 5)
  if (top.length === 0) {
    lines.push('Geen geautomatiseerde overtredingen gevonden. Loop de handmatige checklist door om dit te bevestigen.')
  } else {
    for (const issue of top) {
      const wcag = issue.wcag.length ? `[WCAG ${issue.wcag.join(', ')}] ` : ''
      const mark = issue.crossConfirmed ? '✓ ' : ''
      lines.push(`- ${mark}**${issue.severity}** ${wcag}${issue.help} — ${issue.instances.length}×`)
    }
  }
  lines.push('')

  // --- findings by severity ---
  lines.push('## Bevindingen')
  lines.push('')
  for (const sev of merged.severityOrder) {
    const group = merged.issues.filter((i) => i.severity === sev)
    if (group.length === 0) continue
    lines.push(`### ${SEVERITY_LABEL[sev]}`)
    lines.push('')
    for (const issue of group) {
      const wcag = issue.wcag.length ? `[WCAG ${issue.wcag.join(', ')}] ` : ''
      const pages = new Set(issue.instances.map((x) => x.page)).size
      const conf = issue.crossConfirmed ? '✓ bevestigd door axe + HTMLCS' : `bron: ${issue.engine}`
      lines.push(`- **${wcag}${issue.help}** — \`${issue.ruleId}\` — ${issue.instances.length}× op ${pages} pagina('s) — ${conf}`)
      if (issue.helpUrl) lines.push(`  - ℹ️ ${issue.helpUrl}`)
      for (const inst of issue.instances.slice(0, 5)) {
        const sel = inst.selector ? `\`${inst.selector}\`` : '(pagina-niveau)'
        lines.push(`  - ${sel} — ${inst.page}`)
      }
      if (issue.instances.length > 5) lines.push(`  - … +${issue.instances.length - 5} meer`)
    }
    lines.push('')
  }

  // --- second opinion (HTMLCS-only, not counted) ---
  lines.push('## Tweede mening (HTMLCS-only)')
  lines.push('')
  if (!merged.secondOpinion || merged.secondOpinion.length === 0) {
    lines.push('Geen extra HTMLCS-meldingen buiten wat axe al vond.')
  } else {
    lines.push(
      `${merged.secondOpinion.length} melding(en) die alléén de tweede engine (HTMLCS) zag. ` +
        `HTMLCS-only is op de ACT-benchmark ~53% precies, dus dit zijn aanwijzingen om handmatig te ` +
        `verifiëren — ze tellen **niet** mee in de score, de P-telling of de CI-gate.`
    )
    for (const issue of merged.secondOpinion.slice(0, 25)) {
      const wcag = issue.wcag.length ? `[WCAG ${issue.wcag.join(', ')}] ` : ''
      const pages = new Set(issue.instances.map((x) => x.page)).size
      lines.push(`- ${wcag}${issue.help} — \`${issue.ruleId}\` — ${issue.instances.length}× op ${pages} pagina('s)`)
    }
    if (merged.secondOpinion.length > 25) lines.push(`- … +${merged.secondOpinion.length - 25} meer`)
  }
  lines.push('')

  // --- manual checklist placeholder ---
  lines.push('## Handmatige checklist')
  lines.push('')
  lines.push('> Nog niet ingevuld. Loop `references/manual-checklist.md` door — toetsenbord/tab-volgorde, focusbeheer, screenreader en reflow/zoom worden door géén scanner gedekt. Vul de resultaten hier in en herbereken de composite met manual = 20%.')
  lines.push('')

  // --- pass (short) ---
  const cleanPages = merged.pages.filter((p) => p.navOk && (p.axeViolations === 0 || p.axeViolations == null))
  lines.push('## Pass (kort)')
  lines.push('')
  if (cleanPages.length) {
    lines.push(`${cleanPages.length} pagina('s) zonder geautomatiseerde overtredingen:`)
    for (const p of cleanPages.slice(0, 15)) lines.push(`- ${p.url}`)
  } else {
    lines.push('Geen enkele gescande pagina was vrij van overtredingen.')
  }
  lines.push('')

  // --- not tested ---
  lines.push('## Niet getoetst')
  lines.push('')
  const navFailed = merged.pages.filter((p) => !p.navOk)
  if (navFailed.length === 0 && (!merged.skipped || merged.skipped.length === 0)) {
    lines.push('Alle ontdekte pagina\'s zijn getoetst.')
  } else {
    for (const p of navFailed) lines.push(`- ${p.url} — navigatie mislukt (status ${p.status || '—'}${p.navError ? ', ' + p.navError : ''})`)
    for (const sk of merged.skipped || []) lines.push(`- ${sk.url} — ${sk.reason}`)
  }
  if (merged.lighthouseSkippedReason) lines.push(`- Lighthouse overgeslagen: ${merged.lighthouseSkippedReason}`)
  lines.push('')

  // --- limitations ---
  lines.push('## Beperkingen van deze scan')
  lines.push('')
  for (const lim of LIMITATIONS) lines.push(`- ${lim}`)
  lines.push('')

  return lines.join('\n')
}

/** Returns { json, markdown }. */
export function buildReport(merged, meta) {
  const json = {
    meta: { ...meta, generatedAt: new Date().toISOString() },
    scores: merged.scores,
    counts: merged.counts,
    totalInstances: merged.totalInstances,
    source: merged.source,
    truncated: merged.truncated,
    scanConditions: merged.scanConditions,
    crossConfirmedCount: merged.crossConfirmedCount,
    pages: merged.pages,
    issues: merged.issues,
    secondOpinion: merged.secondOpinion || [],
    skipped: merged.skipped || [],
    lighthouseSkippedReason: merged.lighthouseSkippedReason || null,
  }
  return { json, markdown: buildMarkdown(merged, meta) }
}

/** Write report files to disk. Returns the paths written. */
export function writeReport(outDir, baseUrl, report, format = 'both', date = isoDate()) {
  fs.mkdirSync(outDir, { recursive: true })
  const stem = `a11y-audit-${slugHost(baseUrl)}-${date}`
  const written = []
  if (format === 'json' || format === 'both') {
    const p = path.join(outDir, `${stem}.json`)
    fs.writeFileSync(p, JSON.stringify(report.json, null, 2))
    written.push(p)
  }
  if (format === 'md' || format === 'both') {
    const p = path.join(outDir, `${stem}.md`)
    fs.writeFileSync(p, report.markdown)
    written.push(p)
  }
  return written
}
