// Second engine: HTML_CodeSniffer (HTMLCS) — the same engine Pa11y uses. It is
// injected into the SAME hydrated Playwright page as axe (no second browser),
// so it audits identical DOM + computed styles. Its rule codes embed the WCAG
// success criterion, which is how we cross-confirm findings against axe.

import fs from 'node:fs'

let _src
function htmlcsSource() {
  if (_src == null) {
    _src = fs.readFileSync(new URL('../node_modules/html_codesniffer/build/HTMLCS.js', import.meta.url), 'utf8')
  }
  return _src
}

function standardFor(level = 'AA') {
  const l = String(level).toUpperCase()
  if (l === 'A') return 'WCAG2A'
  if (l === 'AAA') return 'WCAG2AAA'
  return 'WCAG2AA'
}

/** Parse the WCAG SC out of an HTMLCS code, e.g. ...1_4_3.G18.Fail -> "1.4.3". */
function wcagFromCode(code) {
  const m = /\.(\d+)_(\d+)_(\d+)\./.exec(code)
  return m ? [`${m[1]}.${m[2]}.${m[3]}`] : []
}

/**
 * Run HTMLCS on a Playwright page. Only Errors (type 1) become findings;
 * Warnings/Notices are advisory and far too noisy to report as violations.
 * @returns {Promise<{findings:object[], errorCount:number}>}
 */
export async function runHtmlcsOnPage(page, opts = {}) {
  await page.addScriptTag({ content: htmlcsSource() })
  const standard = standardFor(opts.level)

  const raw = await page.evaluate(
    (std) =>
      new Promise((resolve) => {
        function cssPath(el) {
          if (!el || el.nodeType !== 1) return ''
          const parts = []
          let node = el
          let depth = 0
          while (node && node.nodeType === 1 && depth < 5) {
            let part = node.nodeName.toLowerCase()
            if (node.id) {
              parts.unshift(`#${node.id}`)
              break
            }
            const cls = (node.getAttribute && node.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean)[0]
            if (cls) part += `.${cls}`
            const parent = node.parentNode
            if (parent && parent.children) {
              const sibs = [...parent.children].filter((c) => c.nodeName === node.nodeName)
              if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(node) + 1})`
            }
            parts.unshift(part)
            node = node.parentNode
            depth++
          }
          return parts.join(' > ')
        }
        try {
          window.HTMLCS.process(std, window.document, () => {
            const msgs = window.HTMLCS.getMessages() || []
            resolve(
              msgs
                .filter((m) => m.type === 1)
                .map((m) => ({
                  code: m.code,
                  msg: m.msg,
                  selector: cssPath(m.element),
                  snippet: m.element && m.element.outerHTML ? m.element.outerHTML.slice(0, 240) : '',
                }))
            )
          })
        } catch (e) {
          resolve({ __error: String(e && e.message || e) })
        }
      }),
    standard
  )

  if (raw && raw.__error) {
    return { findings: [], errorCount: 0, error: raw.__error }
  }

  const pageUrl = page.url()
  const findings = raw.map((m) => ({
    engine: 'htmlcs',
    ruleId: m.code,
    wcag: wcagFromCode(m.code),
    severity: 'P1', // HTMLCS gives no impact level; an Error is a definite failure
    impact: 'error',
    help: m.msg,
    description: m.msg,
    helpUrl: '',
    page: pageUrl,
    selector: m.selector,
    snippet: m.snippet,
    failureSummary: '',
  }))

  return { findings, errorCount: findings.length }
}
