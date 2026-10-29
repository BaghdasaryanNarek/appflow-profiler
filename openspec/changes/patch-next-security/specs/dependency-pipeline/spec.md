# Spec Delta

## ADDED Requirements

### Requirement: Framework is exact-pinned with its lint config in lockstep
`apps/web/package.json` SHALL declare `next` as an exact version (no range), and `eslint-config-next` SHALL declare the same exact version, so framework updates happen only through a reviewed change.

#### Scenario: Pins match
- **WHEN** the toolchain consistency test reads `apps/web/package.json`
- **THEN** `next` is an exact `MAJOR.MINOR.PATCH` version and `eslint-config-next` equals it

#### Scenario: Range is rejected
- **WHEN** `next` is declared as a range such as `^15.5.28` or `15.x`
- **THEN** the toolchain consistency test fails

### Requirement: Lockfile resolves the pinned framework version
The committed `apps/web/pnpm-lock.yaml` SHALL resolve `next` to exactly the version declared in `apps/web/package.json`.

#### Scenario: Lockfile matches the manifest
- **WHEN** the toolchain consistency test compares the manifest with the lockfile
- **THEN** every resolved `next` version equals the declared version

### Requirement: Resolved versions stay at or above the security floor
The lockfile SHALL resolve `next` to `15.5.28` or later and every `sharp` to `0.35.5` or later, the first versions that fix the Image Optimization RCE and the Server Actions DoS advisories.

#### Scenario: Patched versions resolve
- **WHEN** the toolchain consistency test reads the lockfile
- **THEN** `next` is at least `15.5.28` and every resolved `sharp` is at least `0.35.5`

#### Scenario: Vulnerable version is rejected
- **WHEN** a resolved version is below its floor, such as `next@15.5.27` or `sharp@0.35.4`
- **THEN** the floor check reports it as below the floor
