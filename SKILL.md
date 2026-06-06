---
name: accessibility
description: Voer een uitgebreide, tool-gedreven accessibility-audit uit (WCAG 2.2 AA) op elke draaiende site — twee scan-engines (axe-core + HTML_CodeSniffer) met cross-engine bevestiging + Lighthouse-score, plus een verplichte handmatige checklist. Stack-agnostisch (Next.js, Astro, WordPress, .NET, plain HTML), herbruikbaar over projecten. Gebruik bij "accessibility audit", "a11y check", "WCAG", "toegankelijkheid testen", of vervanging van axe DevTools / WAVE / Taba11y.
version: 1.0.0
user-invocable: true
argument-hint: "[url of draaiende dev-server, bv. http://localhost:3030]"
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion
license: MIT
---

# Accessibility Audit

Eén herbruikbare audit die het automatiseerbare deel van toegankelijkheidstesten draait —
**twee onafhankelijke engines** (**axe-core** = de axe DevTools-engine, + **HTML_CodeSniffer**,
dezelfde engine als Pa11y) met **cross-engine bevestiging**, plus **Lighthouse** voor de a11y-score
— tegen een draaiende URL, en je daarna door de **handmatige checklist** loodst voor wat geen
scanner vangt (toetsenbord/tab-volgorde, focusbeheer, screenreader, reflow/zoom). Resultaat: één
gescoord WCAG 2.2-rapport met P0–P3-bevindingen, waarbij issues die door ≥2 engines bevestigd zijn
als high-confidence (✓) gemarkeerd worden en single-engine issues als "handmatig verifiëren" (⚠).

**Stack-agnostisch:** werkt op elke site die een URL serveert — lokaal dev óf live productie.
Niets wordt in het geauditeerde project geïnstalleerd; alle dependencies leven in deze skill-map.

> ⚠️ Geautomatiseerde scans dekken slechts ~30–50% van WCAG. De handmatige checklist is
> **verplicht**, niet optioneel. Rapporteer een hoge automatische score nooit als "toegankelijk"
> zonder dat de checklist is doorlopen.

---

## Wanneer te gebruiken
- Een toegankelijkheidsaudit of WCAG-controle van (een deel van) een website.
- Als snelle, herhaalbare vervanging van losse runs met axe DevTools / WAVE / accessibilitychecker.
- Als pre-deploy quality-gate (`--fail-on` geeft een non-zero exit bij P0/P1).

## Stap 0 — Mode-gate (lees eerst)
- **Plan/read-only mode:** draai de scan wél (alleen netwerk/lezen), maar **schrijf géén
  rapportbestand**. Toon de samenvatting inline en bied aan te schrijven in execute-mode.
  Gebruik dan `--stdout` zodat er niets naar schijf gaat.
- **Execute mode:** schrijf het rapport naar schijf en mag je de dev-server starten.

## Stap 1 — Dependency-check (doctor)
Draai de doctor; installeer alleen na bevestiging van de gebruiker (netwerk-actie):
```bash
node ~/.claude/skills/accessibility/scripts/doctor.mjs
```
Ontbreekt er iets, voer uit (installeert in de **skill-map**, niet in het project):
```bash
npm ci --prefix ~/.claude/skills/accessibility/scripts
npx --prefix ~/.claude/skills/accessibility/scripts playwright install chromium
```
De Chromium-binary komt in de gedeelde Playwright-cache (`~/Library/Caches/ms-playwright`),
dus dit gebeurt één keer voor alle projecten.

## Stap 2 — Doel bepalen
Gebruik **AskUserQuestion** om te kiezen: lokale dev-server of live URL.
- Detecteer de dev-poort uit het project (`package.json` → `dev`-script; Next.js vaak **3000**, Vite **5173**, Astro **4321**).
  **Neem de poort nooit zomaar aan** — lees hem of vraag het.
- Check of de server draait (`curl -sI <url>`); zo niet, bied aan hem te starten
  (`npm run dev` in de achtergrond) of vraag om de URL.
- Voor **live productie**: gebruik `--throttle 500 --concurrency 1` om rate-limiting/WAF te ontzien.

## Stap 3 — Scope bevestigen
Vraag (of kies verstandige defaults): welke pagina's (auto-discovery via sitemap/crawl, of
expliciete `--routes`), WCAG-niveau (default **AA**), en of consent/auth nodig is.

## Stap 4 — Scan draaien
```bash
node ~/.claude/skills/accessibility/scripts/a11y-scan.mjs <baseUrl> [opties]
```
Veelgebruikt:
```bash
# lokaal, auto-discovery (sitemap → crawl), schrijft rapport in docs/audits/accessibility/
a11y-scan http://localhost:3030

# expliciete pagina's
a11y-scan http://localhost:3030 --routes /,/over-ons,/contact

# plan/read-only: niets naar schijf
a11y-scan http://localhost:3030 --stdout

# achter cookie-banner / ingelogd
a11y-scan https://site.nl --dismiss-consent --auth-state ./auth.json --throttle 500 --concurrency 1

# snel, alleen axe
a11y-scan http://localhost:3030 --no-lighthouse
```
Parse de **JSON** (bron van waarheid), niet de Markdown. Volledige flag-lijst: `a11y-scan --help`.

## Stap 5 — Handmatige checklist (verplicht)
Lees `references/manual-checklist.md` en loop hem **samen met de gebruiker** door, per sectie:
toetsenbord & tab-volgorde (vervangt Taba11y), focusbeheer, screenreader, contrast op beeld,
reflow/zoom, doelgrootte, motion, formulieren, structuur. Noteer per item ✅/⚠️/❌ en bereken
de manual-score (`passes / (passes+fails) × 100`).

## Stap 6 — Samenvoegen & schrijven
- In **execute mode**: het script schreef al de automatische helft. Vul de sectie
  "Handmatige checklist" in het Markdown-rapport in (met **Edit**) en herbereken de composite
  met weging **Lighthouse 40% / axe 40% / manual 20%** (zie `references/severity-mapping.md`).
- In **plan mode**: presenteer alles inline; schrijf niets.
- Standaardlocatie rapport: `docs/audits/accessibility/` (anders `reports/accessibility/`).

## Stap 7 — Fixes voorstellen
Detecteer de stack (`package.json`/config) en gebruik het juiste remediation-doc:
- `references/remediation-nextjs.md` (dep `next`)
- `references/remediation-astro.md` (dep `astro`)
- `references/remediation-generic-html.md` (WordPress / .NET / overig)

Geef per P0/P1-bevinding een concrete fix met WCAG-SC. Voor de uitvoering kun je doorverwijzen
naar zusterskills `/audit`, `/harden`, `/polish` — **deze skill auditeert alleen**.

---

## Rapport-opbouw
Health Score (Lighthouse / axe / manual / composite + band) · Samenvatting (top issues) ·
Bevindingen per P0–P3 (elk met WCAG-SC, pagina, `selector`, impact, bron) · Handmatige
checklist · Pass (kort) · **Niet getoetst** · Beperkingen.

Severity: axe `critical→P0 · serious→P1 · moderate→P2 · minor→P3`. Details:
`references/severity-mapping.md`.

## Beperkingen (altijd benoemen in het rapport)
Automatisering ~30–50% van WCAG → handmatige checklist verplicht · contrast op afbeeldingen/
gradients en dynamische/stateful UI niet auto-gedekt · cross-origin iframes en PDF/non-HTML
buiten scope · live sites kunnen rate-limiten of headless Chromium blokkeren (403 → "niet getoetst").

## Herbruik over projecten
De skill is globaal en URL-gedreven; dezelfde `a11y-scan <url>` werkt op Next.js, Astro,
WordPress en .NET zonder per-project setup. Optioneel per project een `a11y.config.json` met
vaste `routes` zodat audits reproduceerbaar zijn.
