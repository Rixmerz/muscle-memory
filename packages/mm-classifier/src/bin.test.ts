/**
 * Exercises the built binary: exit code, stdout and files are the contract
 * (spec.md). Spawned asynchronously because the stub Laya server lives in
 * this process and a sync spawn would block it from answering.
 * Requires `dist/bin.js`, i.e. `pnpm build` first.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEAD_URL, startStub, type Stub } from "./stub-server.fixture.js";

const BIN = fileURLToPath(new URL("../dist/bin.js", import.meta.url));

const DEFINITION = {
  description: "How risky is a shell command",
  input: { command: "tool_input.command" },
  questions: {
    risk: { type: "choice", instructions: "How risky is this command?", criteria: { safe: "read-only", destructive: "deletes data" } },
  },
  decide: { question: "risk", routes: { destructive: "deny" }, fallback: "continue", minConfidence: 0.6 },
  examples: [
    { input: { tool_input: { command: "rm -rf build" } }, expect: "destructive" },
    { input: { tool_input: { command: "ls" } }, expect: "safe" },
  ],
};

interface Result {
  status: number | null;
  stdout: string;
  stderr: string;
}

let stub: Stub;
let root: string;

beforeAll(async () => {
  stub = await startStub();
});
afterAll(() => stub.close());
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "mm-classifier-bin-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function run(args: string[], input = "", url = stub.url): Promise<Result> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [BIN, ...args], { cwd: root, env: { ...process.env, MM_LAYA_URL: url } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    child.on("close", (status) => done({ status, stdout, stderr }));
    child.stdin.end(input);
  });
}

async function create(extra: Record<string, unknown> = {}): Promise<void> {
  mkdirSync(join(root, ".mm"), { recursive: true });
  const r = await run(["new", "bash-risk", "--store", "mm"], JSON.stringify({ ...DEFINITION, ...extra }));
  expect(r.status).toBe(0);
}

describe("new", () => {
  it("refuses without a storage choice and writes nothing", async () => {
    const r = await run(["new", "bash-risk"], JSON.stringify(DEFINITION));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/--store mm.*--out <path>/s);
    expect(existsSync(join(root, ".mm"))).toBe(false);
  });

  it("stores into .mm/classifiers/ and names the file after <name>", async () => {
    await create();
    const saved = JSON.parse(readFileSync(join(root, ".mm", "classifiers", "bash-risk.json"), "utf8"));
    expect(saved.name).toBe("bash-risk");
  });

  it("writes to --out and rejects an invalid definition", async () => {
    expect((await run(["new", "bash-risk", "--out", "classifiers"], JSON.stringify(DEFINITION))).status).toBe(0);
    expect(existsSync(join(root, "classifiers", "bash-risk.json"))).toBe(true);
    const bad = await run(["new", "other", "--out", "classifiers"], JSON.stringify({ ...DEFINITION, decide: { question: "risk" } }));
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/decide\.fallback/);
  });
});

describe("list", () => {
  it("prints name and description", async () => {
    await create();
    expect((await run(["list"])).stdout).toBe("bash-risk\tHow risky is a shell command\n");
  });
});

describe("run", () => {
  it("prints the routed decision for the mapped input", async () => {
    await create();
    const r = await run(["run", "bash-risk"], JSON.stringify({ tool_input: { command: "rm -rf /" } }));
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ classifier: "bash-risk", outcome: "deny", reason: "routed", label: "destructive", model: "english" });
    expect(stub.requests.at(-1)!.state).toEqual({ command: "rm -rf /" });
  });

  it("accepts a path", async () => {
    await run(["new", "bash-risk", "--out", "c"], JSON.stringify(DEFINITION));
    const r = await run(["run", "./c/bash-risk.json"], JSON.stringify({ tool_input: { command: "ls" } }));
    expect(JSON.parse(r.stdout)).toMatchObject({ outcome: "continue", reason: "unrouted", label: "safe" });
  });

  it("exits 3 naming server start when Laya is down", async () => {
    await create();
    const r = await run(["run", "bash-risk"], "{}", DEAD_URL);
    expect(r.status).toBe(3);
    expect(r.stderr).toMatch(/mm-classifier server start/);
  });
});

describe("test", () => {
  it("passes when every example matches, and splits accuracy by rules and Laya", async () => {
    await create();
    const r = await run(["test", "bash-risk"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/accuracy 1\.00 \(2\/2\)/);
    expect(r.stdout).toMatch(/rules 0\/0 · laya 2\/2/);
  });

  it("says when no example reaches Laya", async () => {
    await create({ rules: [{ match: { command: "" }, label: "safe" }], examples: [{ input: { tool_input: { command: "ls" } }, expect: "safe" }] });
    const r = await run(["test", "bash-risk"], "", DEAD_URL);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/rules 1\/1 · laya 0\/0 — no example reaches Laya/);
  });

  it("prints lint warnings on new", async () => {
    mkdirSync(join(root, ".mm"), { recursive: true });
    const r = await run(["new", "bash-risk", "--store", "mm"], JSON.stringify(DEFINITION));
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/warning: questions\.risk: instructions name no state field/);
  });

  it("fails below --min-accuracy", async () => {
    await create({ examples: [{ input: { tool_input: { command: "ls" } }, expect: "destructive" }, ...DEFINITION.examples] });
    const r = await run(["test", "bash-risk", "--min-accuracy", "0.9"]);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/accuracy 0\.67/);
  });

  it("refuses a classifier with no examples", async () => {
    await create({ examples: [] });
    const r = await run(["test", "bash-risk"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/untested/);
  });
});

describe("hook", () => {
  const payload = (command: string) =>
    JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } });

  it("denies a PreToolUse call routed to deny", async () => {
    await create();
    const r = await run(["hook", "bash-risk"], payload("rm -rf build"));
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).hookSpecificOutput).toMatchObject({ permissionDecision: "deny" });
  });

  it("prints nothing for a non-hook outcome", async () => {
    await create();
    const r = await run(["hook", "bash-risk"], payload("ls"));
    expect(r).toMatchObject({ status: 0, stdout: "" });
  });

  it("fails open when the server is down or the classifier is missing", async () => {
    await create();
    const down = await run(["hook", "bash-risk"], payload("rm -rf /"), DEAD_URL);
    expect(down).toMatchObject({ status: 0, stdout: "" });
    expect(down.stderr).toMatch(/allowed/);
    const missing = await run(["hook", "nope"], payload("rm -rf /"));
    expect(missing).toMatchObject({ status: 0, stdout: "" });
  });
});

describe("hook-fragment", () => {
  it("prints the wiring relative to $CLAUDE_PROJECT_DIR and touches no settings", async () => {
    await create();
    const r = await run(["hook-fragment", "bash-risk", "--event", "PreToolUse", "--matcher", "Bash"]);
    expect(r.status).toBe(0);
    const entry = JSON.parse(r.stdout).hooks.PreToolUse[0];
    expect(entry.matcher).toBe("Bash");
    expect(entry.hooks[0].command).toMatch(/ hook "\$CLAUDE_PROJECT_DIR\/\.mm\/classifiers\/bash-risk\.json"$/);
    expect(existsSync(join(root, ".claude", "settings.json"))).toBe(false);
  });

  it("requires --event", async () => {
    await create();
    expect((await run(["hook-fragment", "bash-risk"])).status).toBe(1);
  });
});

describe("usage", () => {
  it("prints usage and exits 1 for an unknown command", async () => {
    const r = await run(["frobnicate"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/usage: mm-classifier/);
  });

  it("server needs an action", async () => {
    expect((await run(["server"])).status).toBe(1);
  });
});
