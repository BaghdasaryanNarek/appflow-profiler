import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Guards the toolchain pins described in CONTRIBUTING.md ("Dependency updates"):
// files rewritten by pnpm must stay out of Prettier, otherwise every Dependabot PR fails format:check.
// import.meta.url is not a file: URL under the jsdom environment, so resolve from __dirname.
const webDir = path.resolve(__dirname, "../..");

function readWebFile(relativePath: string): string {
  return readFileSync(path.join(webDir, relativePath), "utf-8");
}

function ignoredPatterns(ignoreFile: string): string[] {
  return ignoreFile
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

interface WebManifest {
  packageManager?: unknown;
  engines?: { node?: unknown };
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
}

function readManifest(): WebManifest {
  return JSON.parse(readWebFile("package.json")) as WebManifest;
}

// An exact version keeps CI (pnpm/action-setup), Vercel and local installs on the same pnpm.
function isExactPnpmPin(value: unknown): boolean {
  return typeof value === "string" && /^pnpm@\d+\.\d+\.\d+$/.test(value);
}

describe("pnpm pin", () => {
  it("declares an exact pnpm version in packageManager", () => {
    expect(isExactPnpmPin(readManifest().packageManager)).toBe(true);
  });

  it.each(["pnpm@12", "pnpm@^12.0.0", "pnpm@12.x", "npm@11.0.0", "", undefined])(
    "rejects %j as a pnpm pin",
    (value) => {
      expect(isExactPnpmPin(value)).toBe(false);
    },
  );
});

// engines.node is the source of truth (read by Vercel and actions/setup-node);
// the root .nvmrc is a convenience for nvm/fnm users and must declare the same major.
function enginesNodeMajor(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d+)\.x$/.exec(value.trim());
  return match?.[1] === undefined ? null : Number(match[1]);
}

function nvmrcMajor(contents: string): number | null {
  const match = /^v?(\d+)(?:\.\d+){0,2}$/.exec(contents.trim());
  return match?.[1] === undefined ? null : Number(match[1]);
}

describe("Node.js pin", () => {
  it("declares a single Node.js major in engines.node", () => {
    expect(enginesNodeMajor(readManifest().engines?.node)).not.toBeNull();
  });

  it("keeps the root .nvmrc on the same major as engines.node", () => {
    const nvmrc = readFileSync(path.join(webDir, "../../.nvmrc"), "utf-8");

    expect(nvmrcMajor(nvmrc)).toBe(enginesNodeMajor(readManifest().engines?.node));
  });

  it("detects a drifted .nvmrc", () => {
    expect(nvmrcMajor("22\n")).not.toBe(enginesNodeMajor("24.x"));
  });

  it.each([">=24", "^24.0.0", "24", "lts/*", undefined])(
    "rejects %j as an engines.node pin",
    (value) => {
      expect(enginesNodeMajor(value)).toBeNull();
    },
  );
});

// next is exact-pinned so framework code changes only through a reviewed diff
// (docs/ARCHITECTURE.md, "Toolchain Pins & Dependency Updates").
type Semver = [number, number, number];

function parseExactVersion(value: unknown): Semver | null {
  if (typeof value !== "string") return null;
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (match === null) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isAtLeast(version: Semver, floor: Semver): boolean {
  for (let i = 0; i < 3; i++) {
    if (version[i] !== floor[i]) return (version[i] ?? 0) > (floor[i] ?? 0);
  }
  return true;
}

// Matches top-level package keys (`  next@15.5.28:` / `  next@15.5.28(peer...)`),
// not scoped packages such as @next/env or @img/sharp-*.
function lockedVersions(lockfile: string, name: string): string[] {
  const pattern = new RegExp(`^ {2}${name}@(\\d+\\.\\d+\\.\\d+)[:(]`, "gm");
  return [...new Set([...lockfile.matchAll(pattern)].map((match) => match[1] ?? ""))];
}

// First versions fixing the Image Optimization RCE (SVG via sharp) and the
// Server Actions DoS advisories (openspec change patch-next-security).
const SECURITY_FLOORS: Record<string, Semver> = {
  next: [15, 5, 28],
  sharp: [0, 35, 5],
};

describe("Next.js pin", () => {
  it("declares an exact next version", () => {
    expect(parseExactVersion(readManifest().dependencies?.next)).not.toBeNull();
  });

  it("keeps eslint-config-next on the same version as next", () => {
    const manifest = readManifest();

    expect(manifest.devDependencies?.["eslint-config-next"]).toBe(manifest.dependencies?.next);
  });

  it("resolves next in the lockfile to the declared version", () => {
    const versions = lockedVersions(readWebFile("pnpm-lock.yaml"), "next");

    expect(versions).toEqual([readManifest().dependencies?.next]);
  });

  it.each(["^15.5.28", "~15.5.28", "15.x", "15.5", "latest", "", undefined])(
    "rejects %j as a next pin",
    (value) => {
      expect(parseExactVersion(value)).toBeNull();
    },
  );
});

describe("Security floors", () => {
  it.each(Object.entries(SECURITY_FLOORS))(
    "resolves every %s at or above its floor",
    (name, floor) => {
      const versions = lockedVersions(readWebFile("pnpm-lock.yaml"), name);

      // An empty match means the lockfile format changed; fail instead of passing vacuously.
      expect(versions.length).toBeGreaterThan(0);
      for (const version of versions) {
        const parsed = parseExactVersion(version);
        expect(parsed, version).not.toBeNull();
        expect(isAtLeast(parsed ?? [0, 0, 0], floor), `${name}@${version}`).toBe(true);
      }
    },
  );

  it.each([
    ["15.5.27", [15, 5, 28]],
    ["15.4.99", [15, 5, 28]],
    ["0.35.4", [0, 35, 5]],
    ["0.34.9", [0, 35, 5]],
  ] as const)("reports %s as below the floor", (version, floor) => {
    expect(isAtLeast(parseExactVersion(version) ?? [0, 0, 0], [...floor])).toBe(false);
  });

  it.each([
    ["15.5.28", [15, 5, 28]],
    ["16.0.0", [15, 5, 28]],
    ["0.35.5", [0, 35, 5]],
  ] as const)("accepts %s at or above the floor", (version, floor) => {
    expect(isAtLeast(parseExactVersion(version) ?? [0, 0, 0], [...floor])).toBe(true);
  });

  it("finds top-level versions but not scoped packages", () => {
    const lockfile = [
      "  next@15.5.27:",
      "  next@15.5.27(react@19.3.1):",
      "  '@next/env@15.5.1':",
      "  '@img/sharp-linux-x64@0.30.0':",
      "  sharp@0.35.4(@types/node@20.19.43):",
    ].join("\n");

    expect(lockedVersions(lockfile, "next")).toEqual(["15.5.27"]);
    expect(lockedVersions(lockfile, "sharp")).toEqual(["0.35.4"]);
  });
});

describe("Prettier ignore for tool-owned files", () => {
  it("ignores files that pnpm rewrites in its own format", () => {
    const patterns = ignoredPatterns(readWebFile(".prettierignore"));

    expect(patterns).toContain("pnpm-lock.yaml");
    expect(patterns).toContain("pnpm-workspace.yaml");
  });

  it("does not treat comments or blank lines as patterns", () => {
    expect(ignoredPatterns("# pnpm-lock.yaml\n\n  \nfoo\n")).toEqual(["foo"]);
  });
});
