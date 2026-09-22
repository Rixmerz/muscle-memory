/**
 * Exercises the built binary directly — exit code, stdout, and filesystem
 * side effects are the contract (spec.md). Requires `dist/bin.js` to exist,
 * i.e. `pnpm build` to have run first.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MMEvent } from "@muscle-memory/core";

const BIN = fileURLToPath(new URL("../dist/bin.js", import.meta.url));

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "mm-learner-bin-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function run(args: string[] = []): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function pre(session: string, sig: string, ts: string, arg: string): MMEvent {
  return { v: 1, ts, session, cwd: root, event: "PreToolUse", tool: "Bash", sig, arg };
}

/** Mirrors `mm-aggregator`'s `bin.test.ts` fixture: one pattern scoring 1.0. */
function seedHighScoringPattern(): void {
  const dir = join(root, ".mm", "events");
  mkdirSync(dir, { recursive: true });

  const events: MMEvent[] = [];
  for (let i = 0; i < 10; i++) {
    const minute = String(i * 5).padStart(2, "0");
    const session = `s${i}`;
    events.push(pre(session, "bash:pnpm-test", `2026-09-20T10:${minute}:00.000Z`, "same00000000"));
    events.push(pre(session, "bash:pnpm-test", `2026-09-20T10:${minute}:01.000Z`, "same00000000"));
    events.push(pre(session, "bash:pnpm-test", `2026-09-20T10:${minute}:02.000Z`, "same00000000"));
    events.push(pre(session, "bash:pnpm-test", `2026-09-20T10:${minute}:03.000Z`, "same00000000"));
  }

  writeFileSync(join(dir, "2026-09-20.ndjson"), `${events.map((e) => JSON.stringify(e)).join("\n")}\n`);
}

function seedGuardedPaths(): { pluginFile: string; settingsFile: string } {
  const pluginFile = join(root, "plugin", "bin", "mm-log.mjs");
  mkdirSync(join(root, "plugin", "bin"), { recursive: true });
  writeFileSync(pluginFile, "// untouched\n");

  const settingsFile = join(root, ".claude", "settings.json");
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(settingsFile, "{}\n");

  return { pluginFile, settingsFile };
}

describe("mm-propose bin", () => {
  it("exits 0 with no output when there is no .mm/ directory", () => {
    const { status, stdout } = run();
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("omits a candidate below --min-score", () => {
    seedHighScoringPattern();
    const { status, stdout } = run(["--min-score", "1.01"]);
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("prints a proposal for a candidate at or above --min-score", () => {
    seedHighScoringPattern();
    const { status, stdout } = run();
    expect(status).toBe(0);
    expect(stdout).toContain("bash:pnpm-test");
    expect(stdout).toContain("hook");
  });

  it("--write creates a markdown file under .mm/proposals/", () => {
    seedHighScoringPattern();
    const { status } = run(["--write"]);
    expect(status).toBe(0);

    const proposalsDir = join(root, ".mm", "proposals");
    expect(existsSync(proposalsDir)).toBe(true);
    const files = readdirSync(proposalsDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}-.*\.md$/);
  });

  it("leaves plugin/ and .claude/settings.json untouched, with or without --write", () => {
    seedHighScoringPattern();
    const { pluginFile, settingsFile } = seedGuardedPaths();
    const before = { plugin: readFileSync(pluginFile, "utf8"), settings: readFileSync(settingsFile, "utf8") };

    run();
    run(["--write"]);

    expect(readFileSync(pluginFile, "utf8")).toBe(before.plugin);
    expect(readFileSync(settingsFile, "utf8")).toBe(before.settings);
  });
});
