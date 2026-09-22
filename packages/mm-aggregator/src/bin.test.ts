/**
 * Exercises the built binary directly — exit code and stdout are the
 * contract (spec.md), and `bin.ts`'s top level calls `process.exit()`, so
 * neither is observable by importing it as a module. Requires `dist/bin.js`
 * to exist, i.e. `pnpm build` to have run first.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MMEvent } from "@muscle-memory/core";

const BIN = fileURLToPath(new URL("../dist/bin.js", import.meta.url));

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "mm-aggregator-bin-"));
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

function seedHighScoringPattern(): void {
  const dir = join(root, ".mm", "events");
  mkdirSync(dir, { recursive: true });

  const events: MMEvent[] = [];
  for (let i = 0; i < 10; i++) {
    const minute = String(i * 5).padStart(2, "0");
    const session = `s${i}`;
    events.push(pre(session, "w", `2026-09-20T10:${minute}:00.000Z`, "same00000000"));
    events.push(pre(session, "x", `2026-09-20T10:${minute}:01.000Z`, "argx00000000"));
    events.push(pre(session, "y", `2026-09-20T10:${minute}:02.000Z`, "argy00000000"));
    events.push(pre(session, "z", `2026-09-20T10:${minute}:03.000Z`, "argz00000000"));
  }

  writeFileSync(join(dir, "2026-09-20.ndjson"), `${events.map((e) => JSON.stringify(e)).join("\n")}\n`);
}

describe("mm-candidates bin", () => {
  it("exits 0 with no output when there is no .mm/ directory", () => {
    const { status, stdout } = run();
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("exits 0 with no output when .mm/events/ has no events", () => {
    mkdirSync(join(root, ".mm", "events"), { recursive: true });
    const { status, stdout } = run();
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("--json emits an array of candidates with steps, score, occurrences, sessions", () => {
    seedHighScoringPattern();
    const { status, stdout } = run(["--json"]);

    expect(status).toBe(0);
    const parsed = JSON.parse(stdout) as Array<{
      steps: string[];
      score: number;
      occurrences: number;
      sessions: number;
    }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      steps: ["w", "x", "y", "z"],
      occurrences: 10,
      sessions: 10,
    });
    expect(parsed[0]?.score).toBeCloseTo(1, 10);
  });

  it("omits a candidate below --min-score", () => {
    seedHighScoringPattern();
    const { stdout } = run(["--json", "--min-score", "1.01"]);
    expect(JSON.parse(stdout)).toEqual([]);
  });
});
