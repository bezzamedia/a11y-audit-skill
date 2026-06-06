#!/usr/bin/env node
// Dependency + environment check. Run before scanning. Exits 0 when everything
// needed is present, 1 otherwise (with copy-paste install instructions).

import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const SKILL_SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url))

// Read the installed package.json straight from node_modules. We avoid
// require.resolve('<pkg>/package.json') because modern packages (e.g.
// @axe-core/playwright) block that subpath via their "exports" field.
function checkPackage(name) {
  try {
    const pkgPath = path.join(SKILL_SCRIPTS_DIR, 'node_modules', name, 'package.json')
    const version = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version
    return { ok: true, version }
  } catch {
    return { ok: false, version: null }
  }
}

async function checkChromium() {
  try {
    const { chromium } = await import('playwright')
    const p = chromium.executablePath()
    return { ok: Boolean(p && fs.existsSync(p)), path: p }
  } catch {
    return { ok: false, path: null }
  }
}

export async function runDoctor() {
  const results = {
    node: process.versions.node,
    packages: {
      playwright: checkPackage('playwright'),
      '@axe-core/playwright': checkPackage('@axe-core/playwright'),
      'axe-core': checkPackage('axe-core'),
      html_codesniffer: checkPackage('html_codesniffer'),
      lighthouse: checkPackage('lighthouse'),
    },
    chromium: { ok: false, path: null },
  }
  if (results.packages.playwright.ok) {
    results.chromium = await checkChromium()
  }

  const missingPkgs = Object.entries(results.packages)
    .filter(([, v]) => !v.ok)
    .map(([k]) => k)
  const needsInstall = missingPkgs.length > 0
  const needsBrowser = !results.chromium.ok

  return { results, needsInstall, needsBrowser, missingPkgs }
}

function printReport({ results, needsInstall, needsBrowser, missingPkgs }) {
  const tick = (b) => (b ? '✓' : '✗')
  console.log('a11y-scan — doctor\n')
  console.log(`  node            ${results.node}`)
  for (const [name, info] of Object.entries(results.packages)) {
    console.log(`  ${tick(info.ok)} ${name.padEnd(24)} ${info.version || 'NIET geïnstalleerd'}`)
  }
  console.log(`  ${tick(results.chromium.ok)} chromium (Playwright)    ${results.chromium.path || 'NIET geïnstalleerd'}`)
  console.log('')

  if (!needsInstall && !needsBrowser) {
    console.log('Alles aanwezig. Klaar om te scannen.')
    return
  }
  console.log('Ontbrekende onderdelen — voer uit (installeert in de skill-map, NIET in je project):\n')
  if (needsInstall) {
    console.log('  npm ci --prefix ~/.claude/skills/accessibility/scripts')
    console.log('  # (of: npm install --prefix ~/.claude/skills/accessibility/scripts)')
  }
  if (needsBrowser) {
    console.log('  npx --prefix ~/.claude/skills/accessibility/scripts playwright install chromium')
  }
  console.log('')
}

// Run directly
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const status = await runDoctor()
  printReport(status)
  process.exit(status.needsInstall || status.needsBrowser ? 1 : 0)
}
