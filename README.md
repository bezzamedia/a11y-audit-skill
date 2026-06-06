# accessibility

A Claude Code skill (and a plain CLI) for accessibility audits. You point it at a running
URL, either a local dev server or a live site, and it runs axe-core, HTML_CodeSniffer and
Lighthouse against the rendered pages, then writes a WCAG 2.2 report with the issues sorted
by severity.

The reason it exists: I was tired of opening four browser tools (axe DevTools, WAVE,
accessibilitychecker.org, Taba11y) every time I wanted to check a page. Now it's one command.

## What it does

It runs two scan engines instead of one: axe-core, the engine inside the axe DevTools
extension, and HTML_CodeSniffer, the engine Pa11y uses. Both run against the same rendered
page. Their rulesets differ, so each catches things the other doesn't. When both flag the
same WCAG criterion on the same page, the issue is marked as high-confidence; when only one
does, it's flagged for manual review.

It also reports a Lighthouse accessibility score, reusing the same Chromium so there's no
second browser to download.

At the end it walks through a manual checklist for the things no scanner can test: keyboard
order, focus handling, screen readers, reflow. Automated tools only reach about a third to
half of WCAG, so this step is not optional.

Because it only needs a URL, it works on any stack (Next.js, Astro, WordPress, .NET, plain
HTML) and installs nothing into the project you're testing.

## Install

It's a Claude Code skill, so it lives in your skills directory:

```bash
git clone https://github.com/bezzamedia/a11y-audit-skill.git ~/.claude/skills/accessibility
cd ~/.claude/skills/accessibility/scripts
npm ci
npx playwright install chromium
node doctor.mjs
```

The dependencies install inside the skill folder, not into the projects you audit. Chromium
comes from the shared Playwright cache.

## Usage

From Claude, in any project:

```
/accessibility http://localhost:3000
/accessibility https://example.com
```

Claude finds the dev server, runs the scan, goes through the manual checklist with you, and
saves the report.

Or run it from a terminal:

```bash
node ~/.claude/skills/accessibility/scripts/a11y-scan.mjs http://localhost:3000

# live site: throttle it and use a single connection
node ~/.claude/skills/accessibility/scripts/a11y-scan.mjs https://example.com \
  --max-pages 20 --throttle 500 --concurrency 1 --dismiss-consent
```

`a11y-scan --help` lists every flag. An alias saves some typing:

```bash
alias a11y-scan='node ~/.claude/skills/accessibility/scripts/a11y-scan.mjs'
```

The flags you'll reach for most:

| Flag | Purpose |
|---|---|
| `--routes /,/a,/b` | explicit pages (otherwise it tries sitemap, then crawls) |
| `--max-pages` / `--max-depth` | discovery limits (default 20 / 2) |
| `--level A\|AA\|AAA` | conformance level (default AA) |
| `--no-htmlcs` / `--no-lighthouse` | turn an engine off |
| `--dismiss-consent` | close cookie banners before scanning |
| `--auth-state file.json` | audit logged-in pages (Playwright storageState) |
| `--throttle` / `--concurrency` | go easy on live sites |
| `--out` / `--format md\|json\|both` / `--stdout` | where and what to write |
| `--fail-on P0\|P1\|P2` | non-zero exit code for CI (default P1) |

## Output

You get a JSON file with the raw data and a Markdown report. The report has a health score
(Lighthouse 40%, axe 40%, manual checklist 20%), the findings grouped P0 to P3 with their
WCAG criterion, page and selector, the manual checklist results, a list of what wasn't
tested, and the known limitations. Files land in `docs/audits/accessibility/` (or
`reports/accessibility/`) of the project you audited.

Worth repeating: a green automated score does not mean a site is accessible. The scanners
cover maybe a third to half of WCAG. Fill in the manual checklist before you trust the number.

## How findings are scored

axe impact maps to P0–P3 (critical, serious, moderate, minor). HTMLCS errors default to P1,
Lighthouse-only findings to P2. The details are in `references/severity-mapping.md`.

## Layout

```
SKILL.md                     the Claude Code skill (the steps Claude follows)
scripts/
  a11y-scan.mjs              CLI entry point
  doctor.mjs                 dependency check
  lib/                       browser, discover, run-axe, run-htmlcs, run-lighthouse, consent, merge, report
references/                  manual checklist, tools mapping, WCAG 2.2 reference, remediation notes
```

## License

MIT.
