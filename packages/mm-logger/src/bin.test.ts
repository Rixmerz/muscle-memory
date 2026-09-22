/**
 * Exercises the built binary directly — process exit code and stdout
 * emptiness are the contract (spec.md), and neither is observable by
 * importing bin.ts as a module, since its top level calls `process.exit()`.
 * Requires `dist/bin.js` to exist, i.e. `pnpm build` to have run first.
 */
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const BIN = fileURLToPath(new URL("../dist/bin.js", import.meta.url));

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "mm-logger-bin-"));
  // Every test below is the opted-in case. The opted-out case is its own
  // describe block, which deliberately does not do this.
  mkdirSync(join(root, ".mm"), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function run(input: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [BIN], { input, cwd: root, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function todayFile(): string {
  const day = new Date().toISOString().slice(0, 10);
  return join(root, ".mm", "events", `${day}.ndjson`);
}

function preToolUsePayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    session_id: "s1",
    cwd: root,
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "pnpm test" },
    ...overrides,
  });
}

describe("mm-log bin", () => {
  it("appends exactly one record for a PreToolUse payload", () => {
    const { status, stdout } = run(preToolUsePayload());

    expect(status).toBe(0);
    expect(stdout).toBe("");

    const lines = readFileSync(todayFile(), "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);

    const record = JSON.parse(lines[0]!);
    expect(record.event).toBe("PreToolUse");
    expect(record.tool).toBe("Bash");
  });

  it("exits 0 with empty stdout on malformed stdin", () => {
    const { status, stdout } = run("not json");
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("exits 0 on empty stdin", () => {
    const { status, stdout } = run("");
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("exits 0 and leaves no partial line when the event directory is unwritable", () => {
    const eventsDir = join(root, ".mm", "events");
    mkdirSync(eventsDir, { recursive: true });
    chmodSync(eventsDir, 0o500);

    const { status } = run(preToolUsePayload());
    expect(status).toBe(0);

    const day = new Date().toISOString().slice(0, 10);
    expect(readdirSync(eventsDir)).not.toContain(`${day}.ndjson`);
  });

  it("records tool: \"unknown\" when tool_name is absent", () => {
    run(
      JSON.stringify({
        session_id: "s1",
        cwd: root,
        hook_event_name: "PreToolUse",
      }),
    );

    const lines = readFileSync(todayFile(), "utf8").trim().split("\n");
    const record = JSON.parse(lines[0]!);
    expect(record.tool).toBe("unknown");
  });

  it("derives ok and dur_ms on PostToolUse from tool_response, and omits them on PreToolUse", () => {
    run(preToolUsePayload());
    run(
      preToolUsePayload({
        hook_event_name: "PostToolUse",
        tool_response: { success: true, durationMs: 42 },
      }),
    );

    const lines = readFileSync(todayFile(), "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);

    const pre = JSON.parse(lines[0]!);
    expect(pre.ok).toBeUndefined();
    expect(pre.dur_ms).toBeUndefined();

    const post = JSON.parse(lines[1]!);
    expect(post.ok).toBe(true);
    expect(post.dur_ms).toBe(42);
  });

  it("50 concurrent invocations produce 50 parseable lines", async () => {
    const invocations = Array.from(
      { length: 50 },
      (_, i) =>
        new Promise<void>((resolve, reject) => {
          const child = spawn(process.execPath, [BIN], { cwd: root });
          child.on("error", reject);
          child.on("exit", () => resolve());
          child.stdin.end(preToolUsePayload({ session_id: `s${i}` }));
        }),
    );

    await Promise.all(invocations);

    const lines = readFileSync(todayFile(), "utf8").trim().split("\n");
    expect(lines).toHaveLength(50);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});

describe("mm-log bin, in a repository that never opted in", () => {
  // `root` here has no `.mm/`: beforeEach created one, so these remove it
  // first. That is the whole condition under test.
  beforeEach(() => {
    rmSync(join(root, ".mm"), { recursive: true, force: true });
  });

  it("writes nothing and creates nothing", () => {
    const { status } = run(preToolUsePayload());

    expect(status).toBe(0);
    expect(readdirSync(root)).toHaveLength(0);
  });

  it("prints nothing on either stream", () => {
    const { stdout, stderr } = run(preToolUsePayload());

    expect(stdout).toBe("");
    expect(stderr).toBe("");
  });

  it("refuses backfill too", () => {
    const result = spawnSync(process.execPath, [BIN, "backfill", root], {
      cwd: root,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(readdirSync(root)).toHaveLength(0);
  });

  it("still records once .mm/ is there", () => {
    // Guards the inversion: a gate that reads the condition backwards passes
    // every assertion above and records nothing, ever.
    mkdirSync(join(root, ".mm"), { recursive: true });

    const { status } = run(preToolUsePayload());

    expect(status).toBe(0);
    expect(readFileSync(todayFile(), "utf8").trim().split("\n")).toHaveLength(1);
  });
});
