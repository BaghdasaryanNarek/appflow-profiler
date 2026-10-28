# Design

## Context

See proposal.md (Why) for the failure. Constraints that shape the approach:

- There is no root `package.json`; the only Node manifest is `apps/web/package.json`, and `pnpm-lock.yaml` lives next to it.
- `pnpm/action-setup` resolves the pnpm version from its `version` input, else from `devEngines.packageManager` / `packageManager` in `package_json_file`, which defaults to the **root** `package.json`. If `version` is set and differs from `packageManager`, the action fails with "Multiple versions of pnpm specified".
- `actions/setup-node` `node-version-file` accepts a `package.json` and reads `engines.node` (after `volta.node` and `devEngines.runtime`).
- Vercel takes the Node major from `engines.node` (for example `24.x`), which overrides Project Settings. `apps/web/vercel.json` overrides `installCommand` (`pnpm install --frozen-lockfile`).
- pnpm 12: with `packageManager` set, pnpm writes a leading "env lockfile document" (pnpm's own resolution and integrity) into `pnpm-lock.yaml`, so the file becomes multi-document YAML. `pmOnFail` defaults to `download`: a different local pnpm downloads and runs the declared version.
- Dependabot: `uv` is a supported `package-ecosystem` value on github.com (version and security updates, no beta flag) and maintains `uv.lock` with `pyproject.toml`. Custom labels replace the default labels, and labels that don't exist in the repo are silently dropped. `commit-message.prefix` + `include: scope` yields `prefix(deps):` / `prefix(deps-dev):`.
- `apps/web/src/types/contracts.gen.ts` is generated but already passed through Prettier by `scripts/gen-contracts.mjs`, so it doesn't conflict with the format check.

## Goals / Non-Goals

**Goals:**
- A Dependabot PR that only bumps versions passes `make ci` / CI without a human touching it.
- One declaration per tool version, read by every consumer; drift is caught by a test, not by a broken deploy.

**Non-Goals:**
- Auto-merge of update PRs.
- Changing Prettier rules or the set of files Prettier checks beyond tool-owned files.
- Removing `--frozen-lockfile` / `uv sync --frozen` anywhere.

## Decisions

1. **Ignore tool-owned files in Prettier (`apps/web/.prettierignore`), rather than formatting them after each update.** Entries: `pnpm-lock.yaml`, `pnpm-workspace.yaml` (pnpm writes `allowBuilds` there via `pnpm approve-builds`). *Alternative:* a post-update hook or bot that runs `prettier --write`. Rejected: Dependabot can't run hooks, and a formatter has no business owning a file the package manager rewrites. Prettier 3 already skips `.gitignore` entries, so nothing else is needed. The lockfile's integrity is guarded by `--frozen-lockfile`, not by the formatter.

2. **`packageManager: "pnpm@12.14.0"` as the single pnpm pin; the workflow reads it.** All three `pnpm/action-setup` steps (contracts, web, e2e) drop `version` and set `package_json_file: apps/web/package.json`. *Alternative:* `devEngines.packageManager` with a range. Rejected: the user asked for `packageManager`, and an exact pin is more reproducible. *Alternative:* keep `version:` in the workflow. Rejected as the primary option because local and Vercel would still float, but it is the fallback (Decision 6). 12.14.0 matches what CI already resolves, so the switch changes no behavior in CI.

3. **Node 24 everywhere, `engines.node: "24.x"` as source of truth.** Node 24 is the current LTS (support until April 2028); Node 22 reaches end of life in April 2027. Vercel already builds on 24.x, so CI starts testing what ships instead of a different major. `setup-node` uses `node-version-file: apps/web/package.json`. A root `.nvmrc` containing `24` exists only for nvm/fnm users; CONTRIBUTING doesn't require any version manager. *Alternative:* Node 22 everywhere. Rejected: it would downgrade production and buy six months before the same migration. *Alternative:* `.nvmrc` as the source of truth. Rejected: Vercel doesn't read it.

4. **Consistency test (`apps/web/tests/unit/toolchain.test.ts`, Vitest, `node:fs`).** It asserts: the `.nvmrc` major == the `engines.node` major; `packageManager` matches `^pnpm@\d+\.\d+\.\d+$`; `.prettierignore` lists `pnpm-lock.yaml`. Negative cases run the same validators on `pnpm@12`, `pnpm@^12.0.0` and a mismatched `.nvmrc` value. It reads repo files, which is the behavior under test, so there is no mocking. Runs in the existing `pnpm test` / `make ci`.

5. **Dependabot layout.** Per ecosystem (`npm` `/apps/web`, `uv` `/apps/api`, `github-actions` `/`):
   ```yaml
   groups:
     <eco>-minor-patch:
       update-types: [minor, patch]
   labels: [dependencies, <javascript|python|github_actions>]
   commit-message:
     prefix: chore            # actions: ci
     prefix-development: chore # npm/uv only
     include: scope
   ```
   Majors fall outside the group and open individually. The schedule (`weekly`) and `open-pull-requests-limit: 10` are unchanged. *Alternative:* one group for all updates. Rejected: a major hidden inside a big group is hard to review and to revert.

6. **Fallback if Dependabot can't handle pnpm 12's multi-document lockfile.** Dependabot support for the env document is not documented, so we plan for it failing.
   - *Detection on the first npm Dependabot run after merge* (trigger it via Insights → Dependency graph → Dependabot → "Check for updates", or wait for the weekly run). Any one of these confirms the failure:
     a. The npm update job in "Recent update jobs" ends in an error mentioning `pnpm-lock.yaml` (for example `dependency_file_not_parseable`), or no npm PR appears although updates are known to exist (the 25 old PRs prove there are some).
     b. A PR is opened, but CI fails at "Install dependencies" (`pnpm install --frozen-lockfile`) with `ERR_PNPM_OUTDATED_LOCKFILE`, `ERR_PNPM_LOCKFILE_*` or a YAML parse error.
     c. The PR diff removes or mangles the first YAML document of `pnpm-lock.yaml` (the `packageManagerDependencies` block).
   - *Action (separate PR):* remove `packageManager` from `apps/web/package.json`; set `version: 12.14.0` (exact) in all three `pnpm/action-setup` steps and drop `package_json_file`; regenerate the lockfile (the env document disappears); switch the consistency test to assert the exact version in `ci.yml`; update CONTRIBUTING. Everything else (Prettier ignore, Node 24, grouping) stays.

7. **Docs.** `CONTRIBUTING.md` gets updated prerequisites and a "Dependency updates" section. `docs/ARCHITECTURE.md` gets a short toolchain/CI note, since `docs/HANDOFF.md` doesn't exist yet (per CLAUDE.md).

## Risks / Trade-offs

- [Vercel pnpm version] With an overridden `installCommand`, Vercel starts its oldest available pnpm, and the docs don't confirm that pnpm switches itself to the `packageManager` version for v12 → check the Preview build log of this PR. If it doesn't switch, set `ENABLE_EXPERIMENTAL_COREPACK=1` in Vercel Project Settings (Vercel documents this for `packageManager`).
- [Dependabot vs env lockfile document] → Decision 6.
- [Orphaned `pip` PRs] After switching to `uv`, existing `pip` PRs may not be closed automatically → close them by hand. They're out of scope anyway.
- [`@types/node` ^20 on Node 24] Types lag the runtime; Node 24 APIs aren't typed → accepted. The major bump arrives as its own Dependabot PR.
- [Contributors on Node 22] `engines` mismatches only warn for the project itself → CONTRIBUTING states Node 24, and CI enforces it.

### Threat note
- **Assets:** CI integrity, the production frontend build, the npm/PyPI supply chain (lockfiles).
- **Entry points:** Dependabot PRs (third-party code), the pnpm binary that pnpm/`pnpm/action-setup` downloads.
- **Top threats:** (1) a malicious or breaking change hidden in a large grouped PR; (2) different pnpm/Node in CI vs production ("green CI, broken prod"); (3) a tampered pnpm download.
- **Mitigations:** majors stay separate PRs for manual review; grouping covers only minor/patch, and CI (`--frozen-lockfile`, `uv sync --frozen`, full test suite, E2E) runs on every group; one exact version declaration per tool, enforced by a test; pnpm 12 records the integrity of the pnpm package itself in the lockfile env document; removing the lockfile from Prettier doesn't weaken any integrity check.

## Migration Plan

1. Merge the PR (CI green on Node 24 / pnpm 12.14.0; Vercel Preview log shows Node 24.x and pnpm 12.14.0).
2. Trigger a Dependabot run and check: grouped PRs per ecosystem, separate majors, labels, title prefixes, green CI, and the Decision 6 detection signals.
3. Close orphaned `pip` PRs and superseded single-dependency PRs as the grouped ones replace them.
4. Rollback: revert the PR. Nothing persists outside the repo, except an optional `ENABLE_EXPERIMENTAL_COREPACK` env var in Vercel, which can be removed.
