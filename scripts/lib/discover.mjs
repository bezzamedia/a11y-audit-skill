// Route/page discovery: explicit routes -> sitemap.xml -> same-origin crawl.
// Returns a de-duplicated, capped list of absolute URLs to audit.

import { normalizeUrl, isNonHtmlUrl } from './util.mjs'

async function fetchText(url, { timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'a11y-scan/1.0 (+accessibility skill)' },
    })
    if (!res.ok) return { ok: false, status: res.status, text: '', contentType: '' }
    const contentType = res.headers.get('content-type') || ''
    const text = await res.text()
    return { ok: true, status: res.status, text, contentType }
  } catch {
    return { ok: false, status: 0, text: '', contentType: '' }
  } finally {
    clearTimeout(t)
  }
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim())
}

/** Collect URLs from a sitemap, following one level of <sitemapindex>. */
async function fromSitemap(baseUrl, log) {
  const candidates = [
    new URL('/sitemap.xml', baseUrl).toString(),
    new URL('/sitemap_index.xml', baseUrl).toString(),
  ]
  const found = new Set()
  for (const sm of candidates) {
    const res = await fetchText(sm)
    if (!res.ok) continue
    const locs = extractLocs(res.text)
    if (locs.length === 0) continue
    log?.(`sitemap: ${sm} -> ${locs.length} entries`)
    // sitemap index? entries that are themselves .xml sitemaps
    const childSitemaps = locs.filter((l) => /\.xml(\?|$)/i.test(l))
    if (childSitemaps.length && /sitemapindex/i.test(res.text)) {
      for (const child of childSitemaps.slice(0, 20)) {
        const cres = await fetchText(child)
        if (cres.ok) extractLocs(cres.text).forEach((l) => found.add(l))
      }
    } else {
      locs.forEach((l) => found.add(l))
    }
    if (found.size) break
  }
  return [...found]
}

function extractLinks(html, pageUrl) {
  const hrefs = [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["']/gi)].map((m) => m[1])
  return hrefs.map((h) => normalizeUrl(h, pageUrl, pageUrl)).filter(Boolean)
}

/** Breadth-first same-origin crawl. */
async function crawl(baseUrl, { maxPages, maxDepth }, log) {
  const start = normalizeUrl(baseUrl, baseUrl, baseUrl)
  const seen = new Set([start])
  const out = [start]
  let frontier = [{ url: start, depth: 0 }]
  while (frontier.length && out.length < maxPages) {
    const nextFrontier = []
    for (const { url, depth } of frontier) {
      if (depth >= maxDepth) continue
      const res = await fetchText(url)
      if (!res.ok || !/html/i.test(res.contentType)) continue
      for (const link of extractLinks(res.text, url)) {
        if (seen.has(link) || isNonHtmlUrl(link)) continue
        seen.add(link)
        out.push(link)
        nextFrontier.push({ url: link, depth: depth + 1 })
        if (out.length >= maxPages) break
      }
      if (out.length >= maxPages) break
    }
    frontier = nextFrontier
    log?.(`crawl: ${out.length} pages discovered`)
  }
  return out
}

/**
 * Resolve the list of URLs to audit.
 * opts: { routes:string[], sitemap:boolean|null, doCrawl:boolean,
 *         maxPages:number, maxDepth:number }
 * Returns { urls, skipped, source }.
 */
export async function discover(baseUrl, opts, log) {
  const { routes, sitemap, doCrawl, maxPages, maxDepth } = opts
  let urls = []
  let source = 'base'

  if (routes && routes.length) {
    urls = routes
      .flatMap((r) => r.split(','))
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => normalizeUrl(r, baseUrl, baseUrl))
      .filter(Boolean)
    // ensure the base itself is included
    urls.unshift(normalizeUrl(baseUrl, baseUrl, baseUrl))
    source = 'routes'
  } else if (doCrawl) {
    urls = await crawl(baseUrl, { maxPages, maxDepth }, log)
    source = 'crawl'
  } else {
    // default: try sitemap, fall back to crawl
    if (sitemap !== false) {
      const sm = await fromSitemap(baseUrl, log)
      const sameOrigin = sm.map((u) => normalizeUrl(u, baseUrl, baseUrl)).filter(Boolean)
      if (sameOrigin.length) {
        urls = sameOrigin
        source = 'sitemap'
      }
    }
    if (urls.length === 0) {
      log?.('no sitemap found — falling back to crawl')
      urls = await crawl(baseUrl, { maxPages, maxDepth }, log)
      source = 'crawl'
    }
  }

  // normalise, dedupe, drop non-HTML, cap
  const skipped = []
  const seen = new Set()
  const kept = []
  for (const u of urls) {
    if (!u) continue
    if (isNonHtmlUrl(u)) {
      skipped.push({ url: u, reason: 'non-HTML resource' })
      continue
    }
    if (seen.has(u)) continue
    seen.add(u)
    kept.push(u)
  }
  let capped = kept
  let truncated = 0
  if (kept.length > maxPages) {
    truncated = kept.length - maxPages
    capped = kept.slice(0, maxPages)
    for (const u of kept.slice(maxPages)) skipped.push({ url: u, reason: `over --max-pages (${maxPages})` })
  }
  return { urls: capped, skipped, source, truncated }
}
