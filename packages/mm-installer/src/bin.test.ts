/**
 * Exercises the built binary directly — exit code, stdout, and filesystem
 * side effects are the contract (spec.md), matching mm-builder's bin.test.ts.
 * Requires `dist/bin.js` to exist, i.e. `pnpm build` to have run first.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const BIN = fileURLToPath(new URL("../dist/bin.js", import.meta.url));

const FRAGMENT = {
  event: "PostToolUse",
  matcher: "Bash",
  command: "pnpm test",
  sourceSignature: "bash:pnpm-test",
};

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "mm-installer-bin-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function run(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function writeFragment(name: string, content: unknown): string {
  const file = join(root, name);
  writeFileSync(file, JSON.stringify(content));
  return file;
}

function settingsPath(): string {
  return join(root, ".claude", "settings.json");
}

function readSettingsFile(): Record<string, unknown> {
  return JSON.parse(readFileSync(settingsPath(), "utf8"));
}

describe("mm-install bin: install", () => {
  it("writes guard.mjs once and does not overwrite it on a second install", () => {
    const file = writeFragment("fragment.json", FRAGMENT);
    const guardPath = join(root, ".mm", "hooks", "guard.mjs");

    const first = run(["install", file]);
    expect(first.status).toBe(0);
    expect(existsSync(guardPath)).toBe(true);
    const originalSource = readFileSync(guardPath, "utf8");

    writeFileSync(guardPath, `${originalSource}\n// tampered`);
    const second = run(["install", file]);
    expect(second.status).toBe(0);

    expect(readFileSync(guardPath, "utf8")).toBe(`${originalSource}\n// tampered`);
  });

  it("is idempotent: installing the identical fragment twice keeps a single entry", () => {
    const file = writeFragment("fragment.json", FRAGMENT);

    run(["install", file]);
    run(["install", file]);

    const settings = readSettingsFile();
    expect((settings.hooks as Record<string, unknown[]>).PostToolUse).toHaveLength(1);
  });

  it("preserves other settings.json keys", () => {
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(settingsPath(), JSON.stringify({ env: { FOO: "bar" } }));
    const file = writeFragment("fragment.json", FRAGMENT);

    run(["install", file]);

    const settings = readSettingsFile();
    expect(settings.env).toEqual({ FOO: "bar" });
    expect(settings.hooks).toBeDefined();
  });

  it("points the settings entry at guard.mjs, never at the raw command directly", () => {
    const file = writeFragment("fragment.json", FRAGMENT);
    run(["install", file]);

    const settings = readSettingsFile();
    const entries = (settings.hooks as Record<string, { hooks: { command: string }[] }[]>).PostToolUse;
    expect(entries[0]?.hooks[0]?.command).toMatch(/^node \.mm\/hooks\/guard\.mjs /);
    expect(entries[0]?.hooks[0]?.command).toContain("pnpm test");
  });

  it("rejects an invalid fragment shape, exits non-zero, and writes nothing", () => {
    const file = writeFragment("fragment.json", { event: "PreToolUse", matcher: "Bash", command: "x" });

    const { status, stderr } = run(["install", file]);

    expect(status).not.toBe(0);
    expect(stderr.length).toBeGreaterThan(0);
    expect(existsSync(settingsPath())).toBe(false);
    expect(existsSync(join(root, ".mm"))).toBe(false);
  });

  it("rejects a fragment missing `command` and writes nothing", () => {
    const file = writeFragment("fragment.json", { event: "PostToolUse", matcher: "Bash" });

    const { status } = run(["install", file]);

    expect(status).not.toBe(0);
    expect(existsSync(join(root, ".mm"))).toBe(false);
  });
});

describe("mm-install bin: uninstall", () => {
  it("removes a live hook's settings entry and its records", () => {
    const file = writeFragment("fragment.json", FRAGMENT);
    const { stdout } = run(["install", file]);
    const id = stdout.trim();

    const { status } = run(["uninstall", id]);
    expect(status).toBe(0);

    const settings = readSettingsFile();
    expect(settings.hooks).toBeUndefined();
    expect(existsSync(join(root, ".mm", "hooks", `${id}.install.json`))).toBe(false);
    expect(existsSync(join(root, ".mm", "hooks", `${id}.state.json`))).toBe(false);
  });

  it("exits 0 and leaves settings.json unchanged for an id that was never installed", () => {
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(settingsPath(), JSON.stringify({ env: { FOO: "bar" } }));

    const { status } = run(["uninstall", "never-installed"]);

    expect(status).toBe(0);
    expect(readSettingsFile()).toEqual({ env: { FOO: "bar" } });
  });
});

describe("guard end-to-end", () => {
  it("demotes after 3 consecutive failing runs, removing the entry from settings.json", () => {
    const file = writeFragment("fragment.json", { ...FRAGMENT, command: "exit 1" });
    const { stdout } = run(["install", file]);
    const id = stdout.trim();

    const guardPath = join(root, ".mm", "hooks", "guard.mjs");
    const runGuard = () =>
      spawnSync(process.execPath, [guardPath, id, "--", "exit", "1"], { cwd: root, encoding: "utf8" });

    const first = runGuard();
    expect(first.status).toBe(1);
    let settings = readSettingsFile();
    expect((settings.hooks as Record<string, unknown[]>).PostToolUse).toHaveLength(1);

    const second = runGuard();
    expect(second.status).toBe(1);
    settings = readSettingsFile();
    expect((settings.hooks as Record<string, unknown[]>).PostToolUse).toHaveLength(1);

    const third = runGuard();
    expect(third.status).toBe(1);
    settings = readSettingsFile();
    expect(settings.hooks).toBeUndefined();

    const state = JSON.parse(readFileSync(join(root, ".mm", "hooks", `${id}.state.json`), "utf8"));
    expect(state.consecutiveFailures).toBe(3);
    expect(state.disabledAt).not.toBeNull();
  });

  it("resets the counter on a success and keeps the entry installed", () => {
    const file = writeFragment("fragment.json", { ...FRAGMENT, command: "exit 1" });
    const { stdout } = run(["install", file]);
    const id = stdout.trim();

    const guardPath = join(root, ".mm", "hooks", "guard.mjs");
    const runGuard = (args: string[]) =>
      spawnSync(process.execPath, [guardPath, id, "--", ...args], { cwd: root, encoding: "utf8" });

    runGuard(["exit", "1"]);
    runGuard(["exit", "1"]);
    const success = runGuard(["exit", "0"]);
    expect(success.status).toBe(0);

    const state = JSON.parse(readFileSync(join(root, ".mm", "hooks", `${id}.state.json`), "utf8"));
    expect(state.consecutiveFailures).toBe(0);

    const settings = readSettingsFile();
    expect((settings.hooks as Record<string, unknown[]>).PostToolUse).toHaveLength(1);
  });
});
