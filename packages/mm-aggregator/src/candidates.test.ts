import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { candidates } from "./candidates.js";
import type { MMEvent } from "@muscle-memory/core";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "mm-aggregator-candidates-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function pre(session: string, sig: string, ts: string, arg: string): MMEvent {
  return { v: 1, ts, session, cwd: root, event: "PreToolUse", tool: "Bash", sig, arg };
}

/**
 * Ten sessions, each running the same 4-step sequence `w -> x -> y -> z`
 * once, evenly spaced 5 minutes apart, all on one day, first step sharing
 * one arg hash. Every sub-window (length 2 and 3) also occurs once per
 * session but scores below 0.80 on `ahorro_potencial` alone (0.5 and 0.75
 * against a perfect 1.0 on every other factor); only the full 4-step window
 * clears the threshold.
 */
function seedCorpus(): void {
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

describe("candidates", () => {
  it("returns [] when .mm/ does not exist", () => {
    expect(candidates(root, { minScore: 0.8 })).toEqual([]);
  });

  it("keeps only the pattern at or above the threshold, sorted descending", () => {
    seedCorpus();
    const results = candidates(root, { minScore: 0.8 });

    expect(results).toHaveLength(1);
    expect(results[0]?.steps).toEqual(["w", "x", "y", "z"]);
    expect(results[0]?.score).toBeCloseTo(1, 10);
    expect(results[0]?.occurrences).toHaveLength(10);
    expect(results[0]?.sessions).toBe(10);
  });
});
