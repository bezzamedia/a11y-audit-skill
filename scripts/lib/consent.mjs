// Best-effort cookie-consent banner dismissal. Clicking "accept" changes what
// is measured (content becomes visible, the banner's own a11y issues disappear),
// so callers must record in the report whether consent was dismissed.

const ACCEPT_SELECTORS = [
  // Common CMP "accept all" buttons
  '#onetrust-accept-btn-handler',
  '.ot-pc-refuse-all-handler', // (refuse) — kept low priority below
  'button#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  'button#CybotCookiebotDialogBodyButtonAccept',
  '.cookiebot-accept',
  '.cky-btn-accept',
  '#cookie-accept',
  '#accept-cookies',
  '.js-accept-cookies',
  '[data-cookieconsent="accept"]',
  '[data-testid="cookie-accept"]',
  'button[aria-label*="accept" i]',
  'button[title*="accept" i]',
]

const ACCEPT_TEXTS = [
  'accept all', 'accept cookies', 'allow all', 'i agree', 'agree',
  'akkoord', 'alles accepteren', 'accepteren', 'sta toe', 'toestaan',
  'alle cookies', 'ja, ik ga akkoord',
]

/**
 * Try to dismiss a consent banner on the given Playwright page.
 * @returns {Promise<{dismissed:boolean, how:string|null}>}
 */
export async function dismissConsent(page, customSelector) {
  const selectors = customSelector ? [customSelector, ...ACCEPT_SELECTORS] : ACCEPT_SELECTORS
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first()
      if (await loc.isVisible({ timeout: 500 }).catch(() => false)) {
        await loc.click({ timeout: 1500 }).catch(() => {})
        await page.waitForTimeout(300)
        return { dismissed: true, how: sel }
      }
    } catch {
      /* keep trying */
    }
  }
  // text-based fallback
  for (const text of ACCEPT_TEXTS) {
    try {
      const loc = page.getByRole('button', { name: new RegExp(text, 'i') }).first()
      if (await loc.isVisible({ timeout: 300 }).catch(() => false)) {
        await loc.click({ timeout: 1500 }).catch(() => {})
        await page.waitForTimeout(300)
        return { dismissed: true, how: `text:${text}` }
      }
    } catch {
      /* keep trying */
    }
  }
  return { dismissed: false, how: null }
}
