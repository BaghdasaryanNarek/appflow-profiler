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
