# Design

## Context

See proposal.md - Why. Facts checked in the installed packages:

- axe-core 4.14.0 removed the `experimental` tag from `label-content-name-mismatch`; 4.13.0 still has it. The E2E scans use `.withTags([... "wcag21a" ...])`, so 4.14 starts running the rule.
- The rule matches elements with a widget role that supports name-from-content (`button`, `link`, ...), an `aria-label`/`aria-labelledby`, and non-empty visible text. It lower-cases both strings, removes parenthesised text, replaces non-letter/number characters with spaces, splits into words, and passes when the visible words are a **contiguous subsequence** of the name words. So `1.2k rps` becomes `1 2k rps` and must appear in that order in the name; a prefix before the visible words is allowed.
- Found during apply (axe-core 4.14 `visibleVirtual`): visible text is the concatenation of descendant text nodes **with no separator between elements**, so `<span>36.66</span><span>rps</span>` reads `36.66rps`. Off-screen text (`.sr-only`, `hidden`) is excluded; `aria-hidden` text is not. Fix: put an explicit `{" "}` text node between adjacent text elements. In flex containers whitespace-only text is not rendered, so nothing changes visually.
- `vitest-axe` already resolves `axe-core@4.14.0` in the lockfile, yet the component axe tests pass. Visible text needs layout, which jsdom does not provide, so vitest-axe cannot be the regression gate for this rule.
- Current names, compared with the visible text:
  - LOD toggle: visible `LOD: Detail` / `LOD: Grouped`, name `Toggle Level of Detail Grouping` → fails.
  - Node card (`role="button"`): visible label, sublabel, health badge (`aria-hidden`), `RPS 1.2k`, `p99 45ms`, `Sat 30%`; name `Service orders-svc, health healthy, 1,234 requests per second, ...` → fails.
  - Edge RPS pill: visible `1.2k rps`, name `Edge <id>, protocol http, health ..., 1,234 requests per second` → fails. The transparent hit-target `<path>` has no visible text and is not matched.
  - Group expand/collapse: visible `4 nodes`, name `Expand service group` → fails. Group select button: visible label is contained in `Select Service Group <label>` → passes.
  - Evidence chip: visible `SERVICE orders-svc (svc:orders)`, name `Inspect evidence node orders-svc (...)` → fails when a kind is shown (`service` precedes the label on screen but not in the name).
  - Toolbar Canvas/Table/Reset and live-strip Pause/Resume/Resync already contain their visible word → pass.

## Goals / Non-Goals

**Goals:**
- Every listed element passes the rule by construction, so wording changes can't silently reintroduce a mismatch.
- Keep the information screen-reader users get today (health, traffic, topology counts).

**Non-Goals:**
- Changing visible text, layout or styling.
- Fixing the chaos E2E retry (report only, see Decision 6).
- Other ARIA issues noticed on the way, such as `aria-label` on the role-less `GroupNode` container. These get reported, not fixed.

## Decisions

### 1. Node card: name from content, extra context in `aria-describedby`
Remove the card's `aria-label`. The name then comes from what is rendered: a visually hidden kind prefix (`<span class="sr-only">Service</span>`), label, sublabel, health badge and metrics strip. Health/upstream/downstream go into a visually hidden element referenced by `aria-describedby` (id from `React.useId()`). The health badge loses `aria-hidden`, because its text becomes part of the name. Its icon stays hidden.

*Why:* name equals visible text by construction, with no second formatting path that can drift (the bug today is `toLocaleString()` vs `formatNumber()`). The sr-only kind prefix is allowed because it comes before the visible words.
*Alternative:* rebuild `aria-label` from the same formatters in render order. Rejected: it duplicates the render order in a string and breaks again as soon as someone adds a field to the card.
*Trade-off:* the name now reads in display shorthand ("RPS 1.2k, p99 45ms") instead of "requests per second". That is what sighted users see, and it is what WCAG 2.5.3 asks for.

### 2. Simple controls: visible text first, then the action
- LOD toggle: `` `${lodText}, toggle level of detail grouping` ``, where `lodText` is the same constant the span renders. `aria-pressed` stays.
- Group toggle: `` `${memberCount} nodes, ${isCollapsed ? "expand" : "collapse"} service group` ``.
- Edge RPS pill: `` `${formatNumber(rps)} rps, ${edgeDescription}` ``. The hit-target path keeps plain `edgeDescription`.
- Evidence chip: `` `${kind ? kind + " " : ""}${label} (${nodeId}), health ${health}, inspect on topology map` ``. The `(nodeId)` parenthetical is ignored by the matcher, which also covers the case where it is hidden at narrow widths.

*Why:* these elements have short visible text and a meaningful action. Keeping a single `aria-label` that starts with the visible string matches the user's example and keeps the action verb, which name-from-content would lose. Each visible string comes from one variable shared by the JSX and the label, so the two can't drift apart.
*Alternative:* `aria-describedby` for the action text. Rejected for buttons whose visible text alone ("4 nodes") doesn't say what they do.

### 3. Discovery is driven by the real scan, not only the list above
The first task runs the E2E axe scans on 4.14 and records every `label-content-name-mismatch` node (selector, name, visible text) in the change folder as the red baseline. Elements found beyond the list above are fixed with Decision 2, or Decision 1 for composite cards. If the scan reports something these decisions don't cover, apply stops and the design gets updated first.

### 4. Regression tests: explicit accessible-name assertions
Component tests in `apps/web/tests/components/` (extending `topology-canvas.test.tsx` / `insights.test.tsx`, plus new files if a component has none) render each element and assert with Testing Library, which computes names with `dom-accessibility-api`:
- `getByRole("button", { name: /^LOD: Detail\b/i })`, and after clicking, `/^LOD: Grouped\b/i`;
- node card: the name starts with the kind and contains `label`, `RPS <formatted>` and `p99 <formatted>` in order; `toHaveAccessibleDescription(/health/)` passes;
- edge pill: name starts with the exact rendered pill text;
- group toggle and evidence chip, the same way.

A small helper `expectNameContainsVisibleText(el)` in `tests/helpers/` compares the element's rendered text with its computed name, word by word, following the axe rules described in Context. Like axe, it joins text with no separator, excludes `.sr-only`/`hidden` text, and checks only elements with `aria-label`/`aria-labelledby`. Every covered element calls it, so a field added later is checked too. *Why not vitest-axe:* see Context, the rule can't evaluate visibility in jsdom. The existing vitest-axe assertions stay as they are. The E2E scans remain the authoritative check.

### 5. Dependency bump
`pnpm --dir apps/web add -D @axe-core/playwright@^4.14.0` (using the sandbox XDG workaround) writes `"@axe-core/playwright": "^4.14.0"`, keeping the caret style the other devDependencies use (not an exact pin), and lets pnpm rewrite the lockfile. `axe-core@4.13.0` should then disappear from the lockfile. Only the lockfile and `package.json` change. *Security:* this is a dev-only test dependency from the same maintainer (Deque), with no runtime or bundle exposure.

### 6. Chaos retry finding (report only)
Code reading so far: `POST /api/v1/simulation/scenarios/{id}/activate` depends on `check_scenario_rate_limit`, a per-client-IP `TokenBucketLimiter(rate_per_second=0.1, capacity=1.0)` created once per app in `main.create_app`. Nothing resets it: `/simulation/reset` doesn't, and `ENV=test` doesn't bypass it. Playwright uses `retries: process.env.CI ? 1 : 0`, `workers: 1`, against one long-lived API process. When the first attempt fails after activating (for example on the axe assertion), the retry runs within 10 s from the same IP `127.0.0.1` and gets **429** with `Retry-After`. So the retry fails on `expect(activateRes.ok())`, which hides the original failure. Apply will confirm this by logging the retry's status and body. Possible fixes, to be discussed with the user and not part of this change: an explicit test-only limiter reset, a configurable limiter rate for `ENV=test`, or waiting for `Retry-After` in the test. The ASVS rule matters here: the limiter must not be weakened in `demo`/`live`.

## Risks / Trade-offs

- [The sr-only kind prefix or health badge text might count as "visible" in axe's computation and change the expected word order] → the red-baseline scan and the green re-run in Chromium decide this. If axe treats the badge differently than expected, move health fully into the description.
- [Screen-reader wording changes for node cards; existing tests or E2E selectors that match old names break (e.g. `name: "Expand service group"` in `topology-canvas.test.tsx:266`)] → update those selectors in the same change; switch to `data-testid` only where a name selector would be brittle.
- [`/processes` table rows use a similar `aria-label` pattern] → `row` is not a widget role, so the rule doesn't match it. Keep the table as is and confirm with the scan. The canvas and table stay in sync because both still expose kind, label, health and metrics.
- [Helper re-implements part of axe's matcher] → it's kept small and tested against the examples in the spec scenarios; the E2E scan is still the authoritative check.

## Migration Plan

No data or API migration. Rollback is a revert of the PR. Dependabot PR #34 is not touched: after this merges, Dependabot rebases it and it carries only its remaining updates.
