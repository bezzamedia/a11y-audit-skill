# Tools-mapping — wat de skill automatiseert vs. wat handmatig blijft

Je gebruikte losse tools. Deze skill consolideert het automatiseerbare deel in één
scan (`a11y-scan.mjs`, axe-core + Lighthouse) en vangt de rest in de handmatige checklist.

| Jouw tool | Engine | Status in deze skill | Restwerk |
|---|---|---|---|
| **axe DevTools** (Chrome-extensie) | axe-core | ✅ **Volledig geautomatiseerd** — exact dezelfde engine, via `@axe-core/playwright` op de gehydrateerde DOM | — |
| **accessibilitychecker.org** | axe-core (gehost) | ✅ **Gedekt** — zelfde onderliggende checks als axe | Hun PDF/handmatige rapport-extra's |
| **WAVE** (WebAIM) | eigen engine | 🟡 **Grotendeels gedekt** door axe + Lighthouse (alt, labels, contrast, structuur, ARIA) | WAVE's visuele overlay en enkele structurele "alerts" → steekproef handmatig |
| **Taba11y** (tab-volgorde visualisatie) | n.v.t. (visueel) | 🔴 **Blijft handmatig** — geen scanner meet ervaren tab-volgorde | Checklist §1 (toetsenbord & tab-volgorde) is de vervanger |
| **Chrome Lighthouse** (a11y-tab) | axe-core + extra audits | ✅ **Geautomatiseerd** — geeft de 0–100 a11y-score | — |
| **VoiceOver / NVDA** | screenreader | 🔴 **Blijft handmatig** | Checklist §3 (screenreader) |

## Tweede engine ingebouwd: HTML_CodeSniffer (HTMLCS)

De scan draait standaard **twee onafhankelijke engines**: axe-core én **HTMLCS** (dezelfde engine
die Pa11y intern gebruikt), geïnjecteerd in dezelfde Playwright-pagina. HTMLCS heeft een andere
regelset en vangt dingen die axe mist (en omgekeerd). Bevindingen die door **beide** engines op
dezelfde WCAG-SC/pagina worden gevlagd, worden in het rapport als **✓ high-confidence** gemarkeerd;
single-engine bevindingen krijgen **⚠ handmatig verifiëren**. Uitzetten: `--no-htmlcs`.

| WAVE-achtige tool | Nu gedekt door |
|---|---|
| axe DevTools | axe-core (engine 1) |
| Pa11y / HTMLCS-overlays | HTMLCS (engine 2, ingebouwd) |
| Lighthouse a11y-tab | Lighthouse (score) |

## Belangrijk: dekking

- **axe + Lighthouse delen grotendeels dezelfde engine.** Lighthouse draait axe intern; de skill
  de-dupliceert op `(ruleId, selector, url)` en gebruikt Lighthouse vooral voor de **score**.
- **HTMLCS is wél onafhankelijk** van axe → echte extra dekking, niet alleen een tweede mening.
- Samen dekken ze ~**30–50%** van WCAG. De andere helft — toetsenbord, focus, screenreader,
  reflow, zin van alt-teksten, betekenis-via-kleur — vereist mensenwerk. Daarom is de handmatige
  checklist verplicht en weegt die mee (20%) in de composite.

## Praktisch advies per tool-gewoonte

- Was je gewend axe DevTools per pagina te draaien? → `a11y-scan <url> --routes /,/a,/b` doet alle
  pagina's in één run met hetzelfde resultaat.
- Gebruikte je WAVE voor de structuur-overlay? → controleer landmarks/headings via een screenreader
  (checklist §3/§9); axe vangt de meetbare structuurfouten al.
- Taba11y voor tab-volgorde? → checklist §1, met echte Tab-toets. Geen vervanging te automatiseren.
