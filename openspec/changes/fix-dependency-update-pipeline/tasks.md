# Tasks

## 1. Reproduce the failure

- [x] 1.1 Install frontend deps (`pnpm --dir apps/web install --frozen-lockfile`) and confirm `pnpm --dir apps/web format:check` passes on the current tree (baseline, record output)
- [x] 1.2 Simulate a Dependabot update in a scratchpad copy of `apps/web` (`pnpm update <a patch-level dep> --lockfile-only`, then `pnpm exec prettier --check .`) and verify it fails with a warning on `pnpm-lock.yaml`, matching the CI log

## 2. Exclude tool-owned files from Prettier

- [x] 2.1 Create `apps/web/tests/unit/toolchain.test.ts` with a failing assertion that `apps/web/.prettierignore` exists and lists `pnpm-lock.yaml` and `pnpm-workspace.yaml`; verify it fails (red)
- [x] 2.2 Add `apps/web/.prettierignore` with `pnpm-lock.yaml` and `pnpm-workspace.yaml`; verify the test from 2.1 passes and `pnpm exec prettier --check src` still checks sources (a temporarily misformatted file in `src/` fails the check)
- [x] 2.3 Re-run the 1.2 simulation with the new `.prettierignore` and verify `prettier --check .` passes

## 3. Pin pnpm via packageManager

- [x] 3.1 Extend the toolchain test: `packageManager` must match `^pnpm@\d+\.\d+\.\d+$`, with negative cases for `pnpm@12` and `pnpm@^12.0.0`; verify it fails before 3.2 (red)
- [x] 3.2 Add `"packageManager": "pnpm@12.14.0"` to `apps/web/package.json`; verify the toolchain test passes and `pnpm --version` inside `apps/web` reports 12.14.0
- [x] 3.3 Regenerate the lockfile with pnpm 12.14.0 (`pnpm --dir apps/web install --lockfile-only --fix-lockfile`; plain `--lockfile-only` reports "Already up to date" and keeps the Prettier quoting); verify the main YAML document is semantically identical to `HEAD` (only quoting/format changes plus the env document, no version changes), a second run produces no diff, and `install --frozen-lockfile` passes
- [x] 3.4 In `.github/workflows/ci.yml` (contracts, web, e2e jobs) remove `version: 12` from `pnpm/action-setup` and set `package_json_file: apps/web/package.json`; verify with `grep -n "action-setup" -A3 .github/workflows/ci.yml` that no `version:` remains and all three steps set the path
- [x] 3.5 Update `CONTRIBUTING.md` prerequisites: pnpm version comes from `packageManager` (any pnpm ≥ 11 downloads it, `pmOnFail: download`); verify the text names `apps/web/package.json`

## 4. Align Node 24

- [x] 4.1 Extend the toolchain test: the `engines.node` major equals the `.nvmrc` major, with a negative case for a mismatched value; verify it fails before 4.2 (red)
- [x] 4.2 Add `"engines": { "node": "24.x" }` to `apps/web/package.json` and a root `.nvmrc` containing `24`; verify the toolchain test passes
- [x] 4.3 In `ci.yml` replace `node-version: 22` with `node-version-file: apps/web/package.json` in all three `actions/setup-node` steps; verify by grep that no `node-version: 22` remains
- [x] 4.4 Update `CONTRIBUTING.md` prerequisites to "Node.js 24, source of truth `engines.node`, any install method; `.nvmrc` for nvm/fnm users", with no nvm requirement; verify the text against the spec scenario "Contributor sets up Node.js"

## 5. Dependabot configuration

- [x] 5.1 In `.github/dependabot.yml` switch `/apps/api` from `pip` to `uv`; add `<eco>-minor-patch` groups (`update-types: [minor, patch]`), labels (`dependencies` + `javascript` / `python` / `github_actions`) and `commit-message` (`chore` / `chore` / `include: scope` for npm and uv; `ci` / `include: scope` for actions); verify the YAML parses (`python3 -c "import yaml,sys; yaml.safe_load(open('.github/dependabot.yml'))"` or `uv run --with pyyaml`) and every entry has groups, labels and commit-message
- [x] 5.2 Add a "Dependency updates" section to `CONTRIBUTING.md`: what Dependabot opens (grouped minor/patch per ecosystem, separate majors, labels, prefixes), how to review, why lockfiles are outside Prettier, how to bump Node/pnpm (`engines.node` + `.nvmrc` / `packageManager` in one PR, guarded by the toolchain test), and the post-merge check from design.md Decision 6; verify every command in the section runs as written
- [x] 5.3 Add a short toolchain/CI note to `docs/ARCHITECTURE.md` §2 (Node 24 / pnpm 12.14.0 pins, sources of truth, Dependabot ecosystems); verify the pinned versions in the text match `apps/web/package.json`

## 6. Integration

- [x] 6.1 Run `make ci` and report the real output (state the local Node version; if local Node is still 22, say so explicitly)
- [x] 6.2 Re-run the Dependabot simulation (1.2) on the final tree and verify `pnpm --dir apps/web format:check` passes
- [x] 6.3 Run `openspec validate fix-dependency-update-pipeline --strict` and verify it passes
- [x] 6.4 Hand over the exact file list to stage and a Conventional Commits message (`fix(ci): …`)

## Workflow follow-up

- User: install Node 24 locally (any method, no nvm needed) if `make ci` ran on Node 22.
- User: commit, push and open the PR; check the Vercel Preview build log for Node 24.x and pnpm 12.14.0, and set `ENABLE_EXPERIMENTAL_COREPACK=1` in Vercel if pnpm doesn't switch.
- After merge: trigger a Dependabot run and verify grouping, labels, prefixes and green CI; apply the detection steps and fallback from design.md Decision 6 if the npm job fails on the lockfile.
- Close orphaned `pip` PRs and the single-dependency PRs replaced by groups.
- Archive the change (`/opsx:archive`) after the post-merge check.
