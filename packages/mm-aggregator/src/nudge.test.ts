import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runNudge } from "./nudge.js";
import type { MMEvent } from "@muscle-memory/core";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "mm-aggregator-nudge-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function pre(session: string, sig: string, ts: string): MMEvent {
  return { v: 1, ts, session, cwd: root, event: "PreToolUse", tool: "Bash", sig, arg: "argx00000000" };
}

function seedClearingCandidate(): void {
  const dir = join(root, ".mm", "events");
  mkdirSync(dir, { recursive: true });
  const events: MMEvent[] = [];
  for (let i = 0; i < 10; i++) {
    const minute = String(i * 5).padStart(2, "0");
    const session = `s${i}`;
    events.push(pre(session, "w", `2026-09-20T10:${minute}:00.000Z`));
    events.push(pre(session, "x", `2026-09-20T10:${minute}:01.000Z`));
    events.push(pre(session, "y", `2026-09-20T10:${minute}:02.000Z`));
    events.push(pre(session, "z", `2026-09-20T10:${minute}:03.000Z`));
  }
  writeFileSync(join(dir, "2026-09-20.ndjson"), events.map((e) => JSON.stringify(e)).join("\n") + "\n");
}

describe("runNudge", () => {
  it("no-ops when .mm/ is absent", () => {
    runNudge(root);
    expect(existsSync(join(root, ".mm"))).toBe(false);
  });

  it("writes review-pending.json when a candidate clears the gate", () => {
    seedClearingCandidate();
    runNudge(root);
    const path = join(root, ".mm", "review-pending.json");
    expect(existsSync(path)).toBe(true);
    const record = JSON.parse(readFileSync(path, "utf8"));
    expect(record.count).toBeGreaterThan(0);
    expect(record.ids).toEqual([...record.ids].sort());
  });

  it("skips the write when the candidate id set is unchanged", () => {
    seedClearingCandidate();
    runNudge(root);
    const path = join(root, ".mm", "review-pending.json");
    const firstMtime = statSync(path).mtimeMs;

    runNudge(root);
    const secondMtime = statSync(path).mtimeMs;
    expect(secondMtime).toBe(firstMtime);
  });
});
