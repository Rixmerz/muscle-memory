/**
 * The plugin ships `plugin/bin/mm-classifier.mjs`, not this package: a
 * plugin install runs no package manager. Same checks as the logger's bundle
 * (packages/mm-logger/src/plugin.test.ts), same flags as the root `bundle`
 * script; keep them in step.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import { describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const BUNDLE = join(REPO, "plugin", "bin", "mm-classifier.mjs");
const SKILL = join(REPO, "plugin", "skills", "classifier", "SKILL.md");

describe("the shipped mm-classifier bundle", () => {
  it("imports nothing but Node builtins", () => {
    const imports = [...readFileSync(BUNDLE, "utf8").matchAll(/^import .* from "(.+)";$/gm)].map((m) => m[1]!);
    expect(imports.length).toBeGreaterThan(0);
    for (const specifier of imports) expect(specifier).toMatch(/^node:/);
  });

  it("is byte-identical to a fresh build from the same source", () => {
    const out = join(mkdtempSync(join(tmpdir(), "mm-classifier-bundle-")), "mm-classifier.mjs");
    buildSync({
      entryPoints: [join(REPO, "packages", "mm-classifier", "dist", "bin.js")],
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node22",
      outfile: out,
    });
    expect(readFileSync(out)).toEqual(readFileSync(BUNDLE));
  });

  it("runs standalone and prints usage", () => {
    const result = spawnSync(process.execPath, [BUNDLE], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/usage: mm-classifier/);
  });
});

describe("the classifier skill", () => {
  const text = readFileSync(SKILL, "utf8");

  it("has frontmatter with its name and a description", () => {
    const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
    expect(frontmatter).toMatch(/^name: classifier$/m);
    expect(frontmatter).toMatch(/^description: \S.{40,}$/m);
  });

  it("names only commands the binary has", () => {
    const usage = spawnSync(process.execPath, [BUNDLE], { encoding: "utf8" }).stderr;
    const commands = new Set([...usage.matchAll(/^ {2}([a-z-]+)/gm)].map((m) => m[1]!));
    const used = [...text.matchAll(/node "\$MMC" ([a-z-]+)/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThan(0);
    for (const command of used) expect(commands).toContain(command);
  });
});
