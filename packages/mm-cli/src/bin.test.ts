/**
 * Exercises the built binary directly — exit code, stdout, and filesystem
 * side effects are the contract (spec.md), matching mm-builder's and
 * mm-installer's bin.test.ts. Requires `dist/bin.js` to exist, i.e.
 * `pnpm build` to have run first.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MMEvent } from "@muscle-memory/core";

const BIN = fileURLToPath(new URL("../dist/bin.js", import.meta.url));

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "mm-cli-bin-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function run(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function pre(session: string, sig: string, ts: string, arg: string): MMEvent {
  return { v: 1, ts, session, cwd: root, event: "PreToolUse", tool: "Bash", sig, arg };
}

/**
 * Ten sessions, each running `bash:pnpm-test` four times back to back, 5
 * minutes apart, all on one day — a `hook`-target candidate at 1.0 score,
 * matching `mm-aggregator/src/candidates.test.ts`'s `seedCorpus` shape. Four
 * repeats (rather than two) keep `ahorroPotencial` (`steps.length / 4`) at
 * its maximum so the pattern clears the default `--min-score 0.8` gate.
 */
function seedHookCorpus(): void {
  const dir = join(root, ".mm", "events");
  mkdirSync(dir, { recursive: true });

  const events: MMEvent[] = [];
  for (let i = 0; i < 10; i++) {
    const minute = String(i * 5).padStart(2, "0");
    const session = `s${i}`;
    for (let step = 0; step < 4; step++) {
      events.push(
        pre(session, "bash:pnpm-test", `2026-09-20T10:${minute}:0${step}.000Z`, "same00000000"),
      );
    }
  }

  writeFileSync(join(dir, "2026-09-20.ndjson"), `${events.map((e) => JSON.stringify(e)).join("\n")}\n`);
}

/** Ten sessions alternating a bash step and an edit step four times — a
 * `slash-command`-target candidate at the full `ahorroPotencial`
 * (`formatProposal`'s `classify` only calls a pattern a `hook` when every
 * step is the identical bash command; this one mixes tools). */
function seedSlashCommandCorpus(): void {
  const dir = join(root, ".mm", "events");
  mkdirSync(dir, { recursive: true });

  const events: MMEvent[] = [];
  for (let i = 0; i < 10; i++) {
    const minute = String(i * 5).padStart(2, "0");
    const session = `s${i}`;
    const sigs = ["bash:pnpm-test", "edit:java", "bash:pnpm-test", "edit:java"];
    sigs.forEach((sig, step) => {
      events.push(pre(session, sig, `2026-09-20T10:${minute}:0${step}.000Z`, "same00000000"));
    });
  }

  writeFileSync(join(dir, "2026-09-20.ndjson"), `${events.map((e) => JSON.stringify(e)).join("\n")}\n`);
}

function settingsPath(): string {
  return join(root, ".claude", "settings.json");
}

function seedSettingsFile(): void {
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(settingsPath(), "{}\n");
}

describe("mm run: no flags", () => {
  it("exits 0 and prints nothing when no candidates clear the score gate", () => {
    const { status, stdout } = run([]);
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("prints each candidate prefixed with its zero-based index and writes nothing", () => {
    seedHookCorpus();
    const { status, stdout } = run([]);

    expect(status).toBe(0);
    expect(stdout).toContain("[0]");
    expect(stdout).toContain("bash:pnpm-test");
    expect(existsSync(join(root, ".mm", "proposals"))).toBe(false);
    expect(existsSync(join(root, ".mm", "hooks"))).toBe(false);
    expect(existsSync(settingsPath())).toBe(false);
  });
});

describe("mm run --build --command", () => {
  it("prints a hook fragment for a valid index and leaves settings.json untouched", () => {
    seedHookCorpus();
    seedSettingsFile();
    const before = readFileSync(settingsPath(), "utf8");

    const { status, stdout } = run(["--build", "0", "--command", "pnpm test"]);

    expect(status).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      event: "PostToolUse",
      matcher: "Bash",
      command: "pnpm test",
      sourceSignature: "bash:pnpm-test",
    });
    expect(readFileSync(settingsPath(), "utf8")).toBe(before);
  });

  it("exits 1 naming the out-of-range index and writes nothing", () => {
    seedHookCorpus();
    const { status, stdout, stderr } = run(["--build", "5", "--command", "pnpm test"]);

    expect(status).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toMatch(/5/);
    expect(existsSync(join(root, ".mm", "hooks"))).toBe(false);
  });

  it("rejects a slash-command-target candidate with mm build's own message", () => {
    seedSlashCommandCorpus();
    const { status, stdout, stderr } = run(["--build", "0", "--command", "pnpm test"]);

    expect(status).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toMatch(/mm build only compiles `hook` proposals; slash-command build is not implemented\./);
  });

  it("exits 1 stating --command is required, and builds nothing", () => {
    seedHookCorpus();
    const { status, stdout, stderr } = run(["--build", "0"]);

    expect(status).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toMatch(/--command is required/);
  });
});

describe("mm run --build --command --install", () => {
  it("installs the fragment into settings.json and writes an install record", () => {
    seedHookCorpus();
    const { status, stdout } = run(["--build", "0", "--command", "pnpm test", "--install"]);

    expect(status).toBe(0);
    const id = stdout.trim();
    expect(id.length).toBeGreaterThan(0);

    const settings = JSON.parse(readFileSync(settingsPath(), "utf8"));
    const entries = settings.hooks.PostToolUse as { hooks: { command: string }[] }[];
    expect(entries[0]?.hooks[0]?.command).toContain("pnpm test");

    expect(existsSync(join(root, ".mm", "hooks", `${id}.install.json`))).toBe(true);
    expect(existsSync(join(root, ".mm", "hooks", "guard.mjs"))).toBe(true);
  });

  it("rejects --install without --build and leaves settings.json unchanged", () => {
    seedSettingsFile();
    const before = readFileSync(settingsPath(), "utf8");

    const { status, stderr } = run(["--install"]);

    expect(status).toBe(1);
    expect(stderr).toMatch(/--install requires --build/);
    expect(readFileSync(settingsPath(), "utf8")).toBe(before);
  });
});
