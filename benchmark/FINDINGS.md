# Benchmark findings

What the benchmark told us, and what we changed because of it. Numbers from the run on
2026-06-06 (axe-core 4.12, HTML_CodeSniffer 2.5.1, Lighthouse 12.8, WCAG AA). Re-run with
`node act-runner.mjs --all` and `node compare-runner.mjs <url>` to refresh.

## A. ACT Rules suite (931 WCAG-mapped test cases)

| Variant | Precision | Recall | F1 |
|---|---|---|---|
| axe alone | 87% | 46% | 60% |
| HTMLCS alone | 53% | 17% | 26% |
| union (axe or HTMLCS) | 70% | 48% | 57% |
| cross-confirmed (axe and HTMLCS) | 91% | 15% | 26% |

ACT rule consistency (union): 9/69 rules fully consistent.

Read it honestly:

- axe alone is the strongest single configuration. That matches the wider literature.
- Treating HTMLCS as an equal source (the union) added almost no recall (+2pp) and cost a lot of
  precision (87% to 70%). HTMLCS-only findings are about a coin flip (53% precision).
- The cross-confirmed subset is genuinely high precision (91%) but tiny recall (15%).

So the original "two equal engines" wiring made the headline findings noisier without finding much
more. The second engine is worth keeping, but as a confidence signal, not as an equal source.

Recall is near zero on criteria that aren't really automatable (media 1.2.x, no-keyboard-trap
2.1.2, descriptive headings/labels 2.4.6, error identification 3.3.1). That's expected and is
exactly what the manual checklist exists for. Coverage is strong where automation works: 4.1.2
(91%), 1.4.12 (93%), 1.3.1 (68%), 3.1.1 (67%), 1.1.1 (55%), and 100% on a handful (1.3.5, 2.1.1,
2.2.1, 2.1.3).

## B. Head-to-head (W3C "Before" demo page)

| Tool | Raw findings | Distinct WCAG SCs | Time |
|---|---|---|---|
| ours (axe+HTMLCS) | 87 | 7 | 2.8s |
| Pa11y | 41 | 5 | 2.7s |
| axe-cli | 46 | 6 | 1.7s |
| Lighthouse | 1 audit (score 89) | 0* | 8.6s |

Raw counts aren't comparable (each tool counts instances/rules/messages differently); the distinct
WCAG SC column is the fairer one. *Lighthouse SCs aren't extracted in our parser; it contributes a
score, not SC-level findings. Our extra SCs over the single-engine tools are partly the HTMLCS
noise from finding A, which is why we demoted HTMLCS rather than bragging about the higher count.

## What changed

- axe (plus Lighthouse-only audits) is the primary, P0–P3-counted source and the basis for
  `--fail-on`.
- HTMLCS confirms axe findings; a finding both engines flag on the same WCAG SC and page gets a
  ✓ high-confidence mark (the 91%-precision subset).
- HTMLCS-only findings move to a separate "second opinion" section, kept out of the score, the
  P-counts and the CI gate. They're hints to check by hand, not violations.

Implementation: `scripts/lib/merge.mjs`.
