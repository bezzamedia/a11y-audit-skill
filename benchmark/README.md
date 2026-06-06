# benchmark

Two ways to check this skill against the rest of the field instead of just claiming it's good.

## A. ACT Rules coverage (`act-runner.mjs`)

Runs the [W3C ACT Rules test cases](https://act-rules.github.io/) through our two engines and
measures how often we agree with the expected outcome. The ACT suite is the official set of
WCAG conformance test rules, so this is the closest thing to an objective yardstick, and it's
the same suite tool vendors report against.

It also answers the question the cross-engine feature exists for: does confirming a finding with
both engines actually improve precision? The report breaks results into four variants: axe alone,
HTMLCS alone, union (either engine), and cross-confirmed (both engines).

```bash
# no extra install — reuses the skill's own engines
node act-runner.mjs --limit 200          # quick sample
node act-runner.mjs --all                # full suite (~931 WCAG-mapped cases, slower)
node act-runner.mjs --rule 5f99a7        # one rule
```

Method, stated plainly: for each WCAG-mapped test case we check whether our scanner reports a
violation on one of the rule's WCAG success criteria. That's SC-level rather than exact-rule-level,
but ACT cases are minimal single-issue pages, so it stays close. Non-WCAG rules (WAI-ARIA or
technique-only) are skipped. Many WCAG criteria can't be automated at all (media, timing, meaning),
so low recall there is expected and correct: that's what the manual checklist is for.

## B. Head-to-head on real URLs (`compare-runner.mjs`)

Runs our scanner, Pa11y, axe-cli and Lighthouse against the same URLs and puts the numbers side by
side. This one needs the comparison tools installed:

```bash
npm install            # installs pa11y + @axe-core/cli here, not in the skill
node compare-runner.mjs https://example.com https://another.com --level AA
```

This is indicative, not a precision benchmark. The tools count issues differently (instances vs
rules vs messages), so compare the **distinct WCAG SC** column and the runtime, not the raw counts.
axe-cli needs a local Chrome plus chromedriver; if it can't start, the report says so and the other
tools still run. Part A is the rigorous accuracy measure.

### Keeping axe-cli working when Chrome updates

axe-cli drives your installed Google Chrome through chromedriver, and the two have to share the
same major version. They do not update together: Chrome updates itself silently, but the
`chromedriver` package here is pinned (currently `^148`), so a Chrome update will break axe-cli
until you re-match it. When that happens, reinstall a matching driver:

```bash
# installs the chromedriver that matches your currently installed Chrome
DETECT_CHROMEDRIVER_VERSION=true npm install chromedriver --prefix .
```

Our own scanner (and Part A) don't have this problem: they use Playwright's bundled Chromium,
which is version-locked to the Playwright release, so there's never a mismatch. The axe-cli
fragility is itself a fair point in the comparison.

## Output

Reports land in `results/` (gitignored) as Markdown and JSON, plus a cached copy of the ACT
`testcases.json`.
