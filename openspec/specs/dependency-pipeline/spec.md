# dependency-pipeline Specification

## Purpose

Keeps third-party dependencies current through automated update PRs that pass the repository's quality gate without manual fixes, on a single pinned toolchain shared by CI, the production build and local development.

## Requirements

### Requirement: Tool-generated files are excluded from formatting checks
The frontend formatting check SHALL NOT check files whose format is owned by a package manager (the pnpm lockfile and pnpm workspace file), so that a file rewritten by that tool passes the check unchanged.

#### Scenario: Lockfile rewritten by pnpm passes the format check
- **WHEN** pnpm updates a dependency and rewrites `apps/web/pnpm-lock.yaml` in its own format
- **THEN** `pnpm --dir apps/web format:check` exits 0 without reformatting the lockfile

#### Scenario: Hand-written sources are still checked
- **WHEN** a TypeScript, CSS, JSON or Markdown source file in `apps/web` is not Prettier-formatted
- **THEN** `pnpm --dir apps/web format:check` fails and names that file

### Requirement: Committed lockfile is in the package manager's native format
The committed `apps/web/pnpm-lock.yaml` SHALL be byte-identical to what the pinned pnpm version writes for the current manifest.

#### Scenario: Regeneration produces no diff
- **WHEN** `pnpm --dir apps/web install --lockfile-only` is run with the pinned pnpm version on a clean checkout
- **THEN** `git diff --exit-code apps/web/pnpm-lock.yaml` reports no changes

### Requirement: Single pinned pnpm version
The pnpm version SHALL be declared once, as an exact version (no range) in `apps/web/package.json`, and every CI job that installs frontend dependencies SHALL use that declared version.

#### Scenario: CI uses the declared pnpm version
- **WHEN** any CI job sets up pnpm
- **THEN** the installed pnpm version equals the version in the `packageManager` field

#### Scenario: Range or bare major is rejected
- **WHEN** the `packageManager` field is set to a range or bare major such as `pnpm@12` or `pnpm@^12.0.0`
- **THEN** the toolchain consistency test fails

### Requirement: Single Node.js major across environments
CI, the production frontend build and local development SHALL use the same Node.js major version, declared in `engines.node` of `apps/web/package.json`; any secondary version file (such as `.nvmrc`) SHALL declare the same major.

#### Scenario: CI and production read the same declaration
- **WHEN** CI sets up Node.js and Vercel builds the frontend
- **THEN** both use the major version from `engines.node`

#### Scenario: Version files drift
- **WHEN** `.nvmrc` declares a different major than `engines.node`
- **THEN** the toolchain consistency test fails

### Requirement: Minor and patch updates are grouped per ecosystem
Automated dependency updates SHALL group all minor and patch updates of one ecosystem (npm, uv, GitHub Actions) into a single PR per run, and SHALL open each major update as its own PR.

#### Scenario: Several minor and patch updates are available
- **WHEN** a scheduled run finds multiple minor or patch updates in one ecosystem
- **THEN** exactly one grouped PR is opened for that ecosystem

#### Scenario: A major update is available
- **WHEN** a scheduled run finds a major version update
- **THEN** it is proposed in a separate PR that contains only that dependency

### Requirement: Python dependencies are updated through the uv lockfile
Automated updates for `apps/api` SHALL use the ecosystem that maintains `uv.lock`, so that update PRs change `pyproject.toml` and `uv.lock` consistently.

#### Scenario: Python dependency update
- **WHEN** an update PR for `apps/api` is opened
- **THEN** it updates `apps/api/uv.lock` and `uv sync --frozen --all-extras` succeeds on it

### Requirement: Update PRs are labelled and use Conventional Commits
Every automated update PR SHALL carry the `dependencies` label plus one ecosystem label from the repository's existing set (`javascript`, `python`, `github_actions`), and its title SHALL start with a Conventional Commits prefix: `chore(deps):` or `chore(deps-dev):` for package updates, `ci(deps):` for GitHub Actions.

#### Scenario: npm development dependency update
- **WHEN** an update PR bumps only npm development dependencies
- **THEN** its title starts with `chore(deps-dev):` and it is labelled `dependencies` and `javascript`

#### Scenario: GitHub Actions update
- **WHEN** an update PR bumps a GitHub Action
- **THEN** its title starts with `ci(deps):` and it is labelled `dependencies` and `github_actions`

### Requirement: Dependency update flow is documented
`CONTRIBUTING.md` SHALL describe how update PRs are produced and reviewed and how to change the pinned Node.js or pnpm version, and SHALL name `engines.node` as the source of truth without requiring a specific Node version manager.

#### Scenario: Contributor sets up Node.js
- **WHEN** a contributor reads the prerequisites in `CONTRIBUTING.md`
- **THEN** it states Node.js 24 with `engines.node` as the source of truth and does not require nvm
