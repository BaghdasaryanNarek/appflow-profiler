# Tasks

## 1. Bump and reproduce (red)

- [x] 1.1 Run `pnpm --dir apps/web add -D @axe-core/playwright@^4.14.0` (with the sandbox `XDG_RUNTIME_DIR` workaround) and verify that `package.json` reads `"@axe-core/playwright": "^4.14.0"` (caret, not exact), that `git diff --stat` shows only `apps/web/package.json` and `apps/web/pnpm-lock.yaml`, and that `axe-core@4.13.0` is gone from the lockfile
- [x] 1.2 Build the web app with `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WS_URL` set as in `.github/workflows/ci.yml`, start the API with `ENV=test` on 127.0.0.1:8000, run `pnpm --dir apps/web e2e`, and verify the `/topology` audit and the chaos journey fail with `label-content-name-mismatch`. If the sandbox blocks the server or browser, stop and give the user the exact commands to run
- [x] 1.3 Record every reported violation (rule, target selector, accessible name, visible text, route) in `openspec/changes/fix-label-in-name/baseline-violations.md`. Verify that each entry maps to a fix task below. If one doesn't, update design.md before continuing
- [x] 1.4 On the chaos-journey retry, capture the status, `Retry-After` header and body of `POST /api/v1/simulation/scenarios/request-storm/activate` (temporary local logging, not committed). Write the finding into `baseline-violations.md` under "Chaos retry", and verify the logging is reverted (`git diff` shows no change to the spec file)

## 2. Regression test helper

- [x] 2.1 Add `expectNameContainsVisibleText(el)` under `apps/web/tests/` (rendered text minus `aria-hidden` and `.sr-only` nodes, word-level contiguous match per design Decision 4), with unit tests for the spec examples: `LOD: Detail`, `1.2k rps`, a parenthetical, and a non-contiguous mismatch. Verify with `pnpm --dir apps/web exec vitest run` on that test file

## 3. Simple controls

- [x] 3.1 Write failing tests for the LOD toggle in both states (`getByRole("button", { name: /^LOD: Detail\b/i })`, then `/^LOD: Grouped\b/i` after a click, plus the helper), then fix `CanvasToolbar.tsx` per design Decision 2. Verify the tests go red → green
- [x] 3.2 Write failing tests for the group expand/collapse button (name starts with `<n> nodes`, collapsed and expanded), then fix `GroupNode.tsx`, update the existing `name: "Expand service group"` selector in `topology-canvas.test.tsx`, and verify red → green
- [x] 3.3 Write a failing test for the edge RPS pill (name starts with the rendered `formatNumber(rps)` + ` rps`, and the hit-target path keeps the edge description), then fix `TrafficEdge.tsx` and verify red → green
- [x] 3.4 Write failing tests for `EvidenceChip` with and without a live node kind (name starts with `<kind> <label>`, contains health), then fix `EvidenceChip.tsx` and verify red → green
- [x] 3.5 Fix any extra simple-control violations from 1.3 the same way, each with its own red → green test

## 4. Node card

- [x] 4.1 Write failing tests for `BaseNodeCard`: the name starts with the kind and contains label, sublabel, health text, `RPS <formatted>`, `p99 <formatted>` and `Sat`/`Err` in display order (helper passes); `toHaveAccessibleDescription` contains health and the upstream/downstream counts; metrics are not inside an `aria-hidden` subtree. Verify they fail on current code
- [x] 4.2 Implement design Decision 1 in `BaseNodeCard.tsx` (remove `aria-label`, sr-only kind prefix, un-hide the badge text but keep its icon hidden, `aria-describedby` via `React.useId()`, sparkline stays `aria-hidden`). Verify 4.1 is green and existing topology-canvas, keyboard-and-announcements and detail-sheet tests pass
- [x] 4.3 Update any unit or E2E selector that matched the old node-card name (search `tests/` for `requests per second`, `health `, `getByRole("button", { name`), and verify with `pnpm --dir apps/web test`

## 5. Integration verification

- [x] 5.1 Rebuild and rerun `pnpm --dir apps/web e2e` with the backend running as in CI. Verify zero `label-content-name-mismatch` violations on every scanned route, with no rule disabled or excluded (`git diff` has no `disableRules`/`exclude`). Report the full real output
- [x] 5.2 Run `make ci` from the repo root and report the real output (ruff, mypy, pytest coverage, contracts drift, eslint `--max-warnings 0`, prettier, tsc, vitest, next build)
- [x] 5.3 Check `docs/ARCHITECTURE.md` for an accessibility-naming convention. Update it only if this change alters one, and record the decision in the PR description either way
- [x] 5.4 Stage the exact changed files by path on `fix/label-in-name` and commit with a Conventional Commits message (e.g. `fix(web): include visible text in accessible names`) whose body explains why. Verify with `git show --stat HEAD`, and report the chaos-retry finding from 1.4 and the unrelated issues noticed (e.g. `aria-label` on the role-less `GroupNode` container). Don't push and don't touch Dependabot PR #34

## Workflow follow-up

- After the PR is merged, archive the change with `/opsx:archive`, which creates `openspec/specs/accessible-names/spec.md`.
- Dependabot rebases PR #34 on its own with its remaining updates; no action needed on it.
