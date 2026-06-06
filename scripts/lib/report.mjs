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

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const SEV_HTML = {
  P0: { label: 'P0 · Kritiek', cls: 'p0' },
  P1: { label: 'P1 · Ernstig', cls: 'p1' },
  P2: { label: 'P2 · Matig', cls: 'p2' },
  P3: { label: 'P3 · Klein', cls: 'p3' },
}

function bandClass(score) {
  if (score == null) return 'na'
  if (score >= 90) return 'b-excellent'
  if (score >= 75) return 'b-good'
  if (score >= 60) return 'b-ok'
  if (score >= 40) return 'b-poor'
  return 'b-crit'
}

const HTML_STYLE = `
:root{--bg:#fff;--fg:#1a1a1a;--muted:#5a5a5a;--line:#e3e5e5;--card:#f7f8f8;
--p0:#b00020;--p1:#b35900;--p2:#7a6200;--p3:#555;--ok:#0f7a52;--link:#0b5cab}
*{box-sizing:border-box}
body{margin:0;font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--fg);background:var(--bg)}
header,main,footer{max-width:920px;margin:0 auto;padding:0 20px}
header{padding-top:28px;border-bottom:1px solid var(--line);padding-bottom:16px}
h1{margin:0 0 4px;font-size:1.8rem}
h2{margin:34px 0 12px;font-size:1.3rem;border-bottom:1px solid var(--line);padding-bottom:6px}
.sub{font-size:1.05rem;margin:.2rem 0}
.muted{color:var(--muted);font-size:.9rem}
a{color:var(--link)}
a:focus-visible,*:focus-visible{outline:3px solid var(--link);outline-offset:2px}
code{background:#eceeee;padding:.05em .35em;border-radius:4px;font-size:.85em;word-break:break-word}
.warn{background:#fff7e6;border:1px solid #f0d8a0;border-radius:8px;padding:10px 14px;margin:18px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px}
.scorecard{display:flex;gap:22px;align-items:center;flex-wrap:wrap;margin-top:18px}
.gauge{width:120px;height:120px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;flex:0 0 auto}
.gauge .num{font-size:2.2rem;font-weight:700;line-height:1}
.gauge .den{font-size:.8rem;opacity:.9}
.b-excellent{background:#0f7a52}.b-good{background:#357a35}.b-ok{background:#7a6200}.b-poor{background:#b35900}.b-crit{background:#b00020}.na{background:#777}
.scoremeta{flex:1 1 280px}
.band{font-size:1.2rem;font-weight:600;margin:.1rem 0}
.components{list-style:none;padding:0;margin:.4rem 0;display:flex;gap:16px;flex-wrap:wrap;font-size:.9rem}
.sev{display:inline-block;padding:.1em .5em;border-radius:5px;color:#fff;font-size:.78rem;font-weight:700;white-space:nowrap}
.sev.p0{background:var(--p0)}.sev.p1{background:var(--p1)}.sev.p2{background:var(--p2)}.sev.p3{background:var(--p3)}
.sevcounts{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:.6rem 0 .2rem}
.summary{padding-left:1.1rem}.summary li{margin:.25rem 0}
.sevhead{margin-top:22px;padding-left:10px;border-left:4px solid #ccc;font-size:1.05rem}
.sevhead.p0{border-color:var(--p0)}.sevhead.p1{border-color:var(--p1)}.sevhead.p2{border-color:var(--p2)}.sevhead.p3{border-color:var(--p3)}
.issue{border:1px solid var(--line);border-left:4px solid #ccc;border-radius:8px;padding:10px 14px;margin:10px 0;background:#fff}
.issue.p0{border-left-color:var(--p0)}.issue.p1{border-left-color:var(--p1)}.issue.p2{border-left-color:var(--p2)}.issue.p3{border-left-color:var(--p3)}
.issue h3{margin:.1rem 0 .3rem;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;font-weight:600;font-size:1rem}
.wcag{color:var(--muted);font-weight:500;font-size:.85em}
.issue .meta{font-size:.85rem;color:var(--muted);margin:.2rem 0}
.conf{font-weight:600}.conf.ok{color:var(--ok)}
.ref{font-size:.85rem;margin-left:6px}
.insts{list-style:none;padding:0;margin:.3rem 0 0;font-size:.85rem}
.insts li{padding:.15rem 0;border-top:1px dashed var(--line)}
.insts .url{color:var(--muted);margin-left:8px;word-break:break-all}
.more{color:var(--muted);font-style:italic}
.note{background:#eef3f8;border-radius:8px;padding:10px 14px;font-size:.92rem}
.second{font-size:.9rem}
footer{margin:30px auto;padding-top:14px;border-top:1px solid var(--line)}
@media(max-width:560px){.gauge{width:96px;height:96px}.gauge .num{font-size:1.7rem}}
`

function buildHtml(merged, meta) {
  const date = meta.date || isoDate()
  const esc = escapeHtml
  const s = merged.scores
  const c = merged.scanConditions || {}
  const e = meta.engines
  const engines =
    `axe-core ${esc(e.axe)} · ${e.htmlcs ? 'HTMLCS ' + esc(e.htmlcs) : 'HTMLCS (uit)'} · ` +
    `${e.lighthouse ? 'Lighthouse ' + esc(e.lighthouse) : 'Lighthouse (uit)'}`

  const instList = (issue) => {
    const items = issue.instances
      .slice(0, 8)
      .map((i) => `<li><code>${esc(i.selector || '(pagina-niveau)')}</code><span class="url">${esc(i.page)}</span></li>`)
      .join('')
    const more = issue.instances.length > 8 ? `<li class="more">… +${issue.instances.length - 8} meer</li>` : ''
    return `<ul class="insts">${items}${more}</ul>`
  }

  const issueCard = (issue) => {
    const sev = SEV_HTML[issue.severity] || { label: issue.severity, cls: '' }
    const wcag = issue.wcag.length ? `<span class="wcag">WCAG ${esc(issue.wcag.join(', '))}</span>` : ''
    const pages = new Set(issue.instances.map((x) => x.page)).size
    const conf = issue.crossConfirmed
      ? `<span class="conf ok">✓ axe + HTMLCS</span>`
      : `<span class="conf">bron: ${esc(issue.engine)}</span>`
    const help = issue.helpUrl ? `<a class="ref" href="${esc(issue.helpUrl)}" rel="noopener noreferrer">regel-uitleg ↗</a>` : ''
    return `<article class="issue ${sev.cls}">
<h3><span class="sev ${sev.cls}">${esc(sev.label)}</span> ${wcag} ${esc(issue.help)}</h3>
<p class="meta"><code>${esc(issue.ruleId)}</code> · ${issue.instances.length}× op ${pages} pagina(’s) · ${conf}${help}</p>
${instList(issue)}
</article>`
  }

  const findings =
    merged.severityOrder
      .map((sevKey) => {
        const group = merged.issues.filter((i) => i.severity === sevKey)
        if (!group.length) return ''
        return `<h3 class="sevhead ${SEV_HTML[sevKey]?.cls || ''}">${esc(SEVERITY_LABEL[sevKey])}</h3>${group.map(issueCard).join('')}`
      })
      .join('') || '<p>Geen geautomatiseerde overtredingen.</p>'

  let secondHtml
  if (!merged.secondOpinion || merged.secondOpinion.length === 0) {
    secondHtml = '<p>Geen extra HTMLCS-meldingen buiten wat axe al vond.</p>'
  } else {
    const items = merged.secondOpinion
      .slice(0, 25)
      .map((issue) => {
        const wcag = issue.wcag.length ? `<span class="wcag">WCAG ${esc(issue.wcag.join(', '))}</span> ` : ''
        const pages = new Set(issue.instances.map((x) => x.page)).size
        return `<li>${wcag}${esc(issue.help)} <code>${esc(issue.ruleId)}</code> · ${issue.instances.length}× op ${pages} pagina(’s)</li>`
      })
      .join('')
    const more = merged.secondOpinion.length > 25 ? `<li class="more">… +${merged.secondOpinion.length - 25} meer</li>` : ''
    secondHtml =
      `<p class="note">${merged.secondOpinion.length} melding(en) die alléén HTMLCS zag (~53% precies op de ACT-benchmark). ` +
      `Hints om handmatig te checken; tellen niet mee in score/P-telling/CI-gate.</p><ul class="second">${items}${more}</ul>`
  }

  const top =
    merged.issues
      .slice(0, 5)
      .map((issue) => {
        const wcag = issue.wcag.length ? `WCAG ${esc(issue.wcag.join(', '))} · ` : ''
        return `<li>${issue.crossConfirmed ? '✓ ' : ''}<span class="sev ${SEV_HTML[issue.severity]?.cls}">${esc(issue.severity)}</span> ${wcag}${esc(issue.help)} — ${issue.instances.length}×</li>`
      })
      .join('') || '<li>Geen geautomatiseerde overtredingen gevonden.</li>'

  const clean = merged.pages.filter((p) => p.navOk && (p.axeViolations === 0 || p.axeViolations == null))
  const cleanHtml = clean.length
    ? `<ul>${clean.slice(0, 20).map((p) => `<li>${esc(p.url)}</li>`).join('')}</ul>`
    : '<p>Geen enkele gescande pagina was vrij van overtredingen.</p>'

  const navFailed = merged.pages.filter((p) => !p.navOk)
  let notTested
  if (!navFailed.length && (!merged.skipped || !merged.skipped.length)) {
    notTested = '<p>Alle ontdekte pagina(’s) zijn getoetst.</p>'
  } else {
    const a = navFailed.map((p) => `<li>${esc(p.url)} — navigatie mislukt (status ${p.status || '—'})</li>`).join('')
    const b = (merged.skipped || []).map((sk) => `<li>${esc(sk.url)} — ${esc(sk.reason)}</li>`).join('')
    notTested = `<ul>${a}${b}</ul>`
  }

  const limitations = LIMITATIONS.map((l) => `<li>${esc(l)}</li>`).join('')

  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accessibility Audit — ${esc(meta.host)} — ${esc(date)}</title>
<style>${HTML_STYLE}</style>
</head>
<body>
<header>
<h1>Accessibility Audit</h1>
<p class="sub"><strong>${esc(meta.host)}</strong> · ${esc(date)} · WCAG ${esc(meta.level)}</p>
<p class="muted">Doel: <a href="${esc(meta.baseUrl)}" rel="noopener noreferrer">${esc(meta.baseUrl)}</a> · ${merged.pages.length} pagina(’s) · Engines: ${engines}</p>
<p class="muted">Scan-condities: consent ${c.consentRequested ? (c.anyConsentDismissed ? 'gesloten' : 'niet gevonden') : 'niet behandeld'} · auth ${c.auth ? 'ja' : 'nee'} · settle ${c.settleMs}ms · discovery: ${esc(merged.source || '')}${merged.truncated ? ` · ⚠ ${merged.truncated} pagina’s afgekapt` : ''}</p>
</header>
<main>
<section class="card scorecard">
<div class="gauge ${bandClass(s.composite)}"><span class="num">${s.composite == null ? '—' : s.composite}</span><span class="den">/100</span></div>
<div class="scoremeta">
<p class="band">${esc(s.compositeBand)} <span class="muted">(composite)</span></p>
<ul class="components">
<li>Lighthouse a11y: <strong>${s.lighthouseAvg == null ? '—' : s.lighthouseAvg + '/100'}</strong></li>
<li>axe pass-rate: <strong>${s.axePassRate == null ? '—' : s.axePassRate + '%'}</strong></li>
<li>Handmatige checklist: <strong>nog niet ingevuld</strong></li>
</ul>
<p class="sevcounts"><span class="sev p0">P0 ${merged.counts.P0}</span><span class="sev p1">P1 ${merged.counts.P1}</span><span class="sev p2">P2 ${merged.counts.P2}</span><span class="sev p3">P3 ${merged.counts.P3}</span><span class="muted">· ${merged.totalInstances} instanties</span></p>
<p class="muted">Cross-engine: ${merged.crossConfirmedCount} van ${merged.issues.length} axe-bevindingen ook door HTMLCS bevestigd (✓).</p>
</div>
</section>
<p class="warn">⚠️ Geautomatiseerde scans dekken ~30–50% van WCAG. Een hoge score zonder ingevulde handmatige checklist betekent <strong>niet</strong> “toegankelijk”.</p>
<section><h2>Samenvatting</h2><ul class="summary">${top}</ul></section>
<section><h2>Bevindingen</h2>${findings}</section>
<section><h2>Tweede mening (HTMLCS-only)</h2>${secondHtml}</section>
<section><h2>Handmatige checklist</h2><p class="note">Nog niet ingevuld. Loop toetsenbord/tab-volgorde, focusbeheer, screenreader en reflow/zoom door — geen scanner dekt die. Zie <code>references/manual-checklist.md</code>.</p></section>
<section><h2>Pass</h2>${cleanHtml}</section>
<section><h2>Niet getoetst</h2>${notTested}${merged.lighthouseSkippedReason ? `<p class="muted">Lighthouse overgeslagen: ${esc(merged.lighthouseSkippedReason)}</p>` : ''}</section>
<section><h2>Beperkingen</h2><ul>${limitations}</ul></section>
</main>
<footer><p class="muted">Gegenereerd door de accessibility-skill · ${esc(date)} · Dit rapport is zelf toegankelijk opgemaakt.</p></footer>
</body>
</html>`
}

/** Returns { json, markdown, html }. */
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
  return { json, markdown: buildMarkdown(merged, meta), html: buildHtml(merged, meta) }
}

/**
 * Write report files to disk. Returns the paths written.
 * format: md | json | html | both (md+json) | all (md+json+html, default).
 */
export function writeReport(outDir, baseUrl, report, format = 'all', date = isoDate()) {
  fs.mkdirSync(outDir, { recursive: true })
  const stem = `a11y-audit-${slugHost(baseUrl)}-${date}`
  const written = []
  const want = (f) => format === f || format === 'all' || (format === 'both' && (f === 'md' || f === 'json'))
  if (want('json')) {
    const p = path.join(outDir, `${stem}.json`)
    fs.writeFileSync(p, JSON.stringify(report.json, null, 2))
    written.push(p)
  }
  if (want('md')) {
    const p = path.join(outDir, `${stem}.md`)
    fs.writeFileSync(p, report.markdown)
    written.push(p)
  }
  if (want('html')) {
    const p = path.join(outDir, `${stem}.html`)
    fs.writeFileSync(p, report.html)
    written.push(p)
  }
  return written
}
