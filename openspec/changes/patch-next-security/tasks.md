# Tasks

## 1. Dependency bump

- [x] 1.1 Set `next` and `eslint-config-next` to exact `15.5.28` with pnpm (`pnpm add --save-exact`) and verify `git diff apps/web/package.json` shows only those two version changes
- [x] 1.2 Verify in `apps/web/pnpm-lock.yaml` that `next` resolves to `15.5.28`, every resolved `sharp` is `>= 0.35.5`, and the lockfile diff touches no other top-level dependency versions

## 2. Regression guard

- [x] 2.1 Add exact-pin, lockstep, lockfile-match and security-floor checks (with negative cases for ranges and below-floor versions) to `apps/web/tests/unit/toolchain.test.ts` and verify `pnpm --dir apps/web exec vitest run tests/unit/toolchain.test.ts` passes

## 3. Documentation

- [x] 3.1 Add the exact-pin rationale and the manual 15.x patching policy to the Toolchain section of `docs/ARCHITECTURE.md` and verify `prettier --check` (via `make web-check`) passes

## 4. Verification

- [x] 4.1 Run `make ci` and verify it exits 0
- [x] 4.2 Build with `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WS_URL` set as in CI, start the API with `ENV=test`, run `pnpm --dir apps/web e2e`, and verify all tests pass
- [x] 4.3 Run `openspec validate --all --strict` and verify it passes

## Workflow follow-up

- Commit as `fix(web): ...` on `fix/next-security-patch`; the user pushes and opens the PR.
- Archive the change after the PR merges.
