// Confusion-matrix bookkeeping for the ACT benchmark.
// "Flagged" = our scanner reported a violation on one of the rule's WCAG SCs.
// Expected "failed" pages should be flagged; "passed"/"inapplicable" should not.

export function newCounts() {
  return { TP: 0, FP: 0, FN: 0, TN: 0 }
}

export function classify(counts, expectedFail, flagged) {
  if (expectedFail) {
    if (flagged) counts.TP++
    else counts.FN++
  } else {
    if (flagged) counts.FP++
    else counts.TN++
  }
}

export function derive(c) {
  const p = c.TP + c.FP ? c.TP / (c.TP + c.FP) : null
  const r = c.TP + c.FN ? c.TP / (c.TP + c.FN) : null
  const f1 = p != null && r != null && p + r > 0 ? (2 * p * r) / (p + r) : null
  return { precision: p, recall: r, f1 }
}

export const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`)
