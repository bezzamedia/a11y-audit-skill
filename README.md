# accessibility — a reusable, stack-agnostic a11y audit skill

A [Claude Code](https://claude.com/claude-code) skill **and** standalone CLI that runs a
comprehensive accessibility audit (WCAG 2.2 AA) against **any running URL** — a local dev
server or a live production site — and produces a scored, P0–P3 report.

It consolidates a manual "open four browser tools" workflow (axe DevTools, WAVE,
accessibilitychecker.org, Taba11y) into one repeatable run.

## Why it's different

- **Two independent scan engines, not one.** [axe-core](https://github.com/dequelabs/axe-core)
  (the engine behind the axe DevTools extension) **and** [HTML_CodeSniffer](https://github.com/squizlabs/HTML_CodeSniffer)
  (the engine Pa11y uses), both injected into the *same* hydrated page.
- **Cross-engine confidence.** Issues flagged by ≥2 engines on the same WCAG success criterion +
  page are marked ✓ high-confidence; single-engine findings are marked ⚠ "verify manually".
- **Lighthouse** accessibility score, sharing the *same* Chromium (no second browser download).
- **Mandatory manual checklist** for what no scanner can catch — keyboard/tab order, focus
  management, screen-reader behaviour, reflow/zoom. (Automation only covers ~30–50% of WCAG.)
- **Stack-agnostic & zero project footprint.** It only needs a URL, so it works on Next.js,
  Astro, WordPress, .NET, plain HTML — and installs **nothing** in the audited project.

## How it works

```
discover routes (explicit | sitemap.xml | same-origin crawl)
   → per page: navigate (Playwright) → axe-core + HTML_CodeSniffer on the live DOM
   → Lighthouse a11y (attached to the same Chromium)
   → merge + de-dupe + cross-engine confirmation
   → JSON (source of truth) + Markdown report (P0–P3, WCAG 2.2 mapped, health score)
```

## Install

This is a Claude Code skill, so it lives under your skills directory. Clone it there:

```bash
git clone https://github.com/bezzamedia/a11y-audit-skill.git ~/.claude/skills/accessibility
cd ~/.claude/skills/accessibility/scripts
npm ci
npx playwright install chromium
node doctor.mjs   # verify everything is present
```

Dependencies (Playwright, @axe-core/playwright, axe-core, html_codesniffer, lighthouse) install
into the skill's own folder — never into the projects you audit. Chromium is shared via the
global Playwright cache.

## Usage

### As a Claude Code skill
In any project, just invoke it — Claude detects the dev server, runs the scan, walks the manual
checklist with you, and writes the report:

```
/accessibility http://localhost:3000
/accessibility https://example.com
```

### As a standalone CLI
```bash
# local dev server
node ~/.claude/skills/accessibility/scripts/a11y-scan.mjs http://localhost:3000

# live site (be gentle: throttle + single connection)
node ~/.claude/skills/accessibility/scripts/a11y-scan.mjs https://example.com \
  --max-pages 20 --throttle 500 --concurrency 1 --dismiss-consent

# all flags
node ~/.claude/skills/accessibility/scripts/a11y-scan.mjs --help
```

Handy shell alias:
```bash
alias a11y-scan='node ~/.claude/skills/accessibility/scripts/a11y-scan.mjs'
```

### Key flags
| Flag | Purpose |
|---|---|
| `--routes /,/a,/b` | explicit pages (else sitemap → crawl) |
| `--max-pages` / `--max-depth` | discovery limits (default 20 / 2) |
| `--level A\|AA\|AAA` | conformance level (default AA) |
| `--no-htmlcs` / `--no-lighthouse` | disable an engine |
| `--dismiss-consent` | auto-close cookie banners |
| `--auth-state file.json` | audit logged-in pages (Playwright storageState) |
| `--throttle` / `--concurrency` | politeness for live sites |
| `--out` / `--format md\|json\|both` / `--stdout` | output control |
| `--fail-on P0\|P1\|P2` | non-zero exit for CI gating (default P1) |

## Report

The Markdown report contains: a composite health score (Lighthouse 40% / axe 40% / manual 20%),
findings grouped P0–P3 (each with WCAG 2.2 SC, page, selector, impact, confirming engines), the
manual checklist results, a "not tested" section, and an explicit limitations section. Reports are
written to `docs/audits/accessibility/` (or `reports/accessibility/`) of the audited project.

> ⚠️ Automated scanners catch only ~30–50% of WCAG issues. A high automated score with an
> un-filled manual checklist is **not** "accessible". The manual checklist is mandatory.

## Severity mapping

axe impact → P-level: `critical→P0 · serious→P1 · moderate→P2 · minor→P3`. HTMLCS errors default
to P1; Lighthouse-only findings to P2. See [`references/severity-mapping.md`](references/severity-mapping.md).

## Repository layout

```
SKILL.md                     # the Claude Code skill (orchestration flow)
scripts/
  a11y-scan.mjs              # CLI entry
  doctor.mjs                 # dependency check / bootstrap
  lib/                       # browser, discover, run-axe, run-htmlcs, run-lighthouse, consent, merge, report
references/                  # manual checklist, tools mapping, WCAG 2.2 reference, remediation (Next.js/Astro/generic)
```

## License

MIT — see [LICENSE](LICENSE).
