import { describe, expect, it } from "vitest";
import { groupSessions, mineNgrams } from "./sequences.js";
import type { MMEvent } from "@muscle-memory/core";

function pre(session: string, sig: string, ts: string, arg = "aaaaaaaaaaaa"): MMEvent {
  return { v: 1, ts, session, cwd: "/repo", event: "PreToolUse", tool: "Bash", sig, arg };
}

function post(session: string, sig: string, ts: string, ok: boolean): MMEvent {
  return { v: 1, ts, session, cwd: "/repo", event: "PostToolUse", tool: "Bash", sig, arg: "aaaaaaaaaaaa", ok };
}

describe("groupSessions", () => {
  it("groups by session and orders each by ts ascending", () => {
    const events = [
      pre("a", "x", "2026-09-20T10:00:02.000Z"),
      pre("a", "y", "2026-09-20T10:00:01.000Z"),
      pre("b", "x", "2026-09-20T10:00:00.000Z"),
    ];

    const sessions = groupSessions(events);
    expect([...sessions.keys()].sort()).toEqual(["a", "b"]);
    expect(sessions.get("a")!.map((e) => e.sig)).toEqual(["y", "x"]);
  });
});

describe("mineNgrams", () => {
  it("produces independent windows per session and never crosses a session boundary", () => {
    // session a: x, y, z — session b: x, y — interleaved in one day file's order.
    const events = [
      pre("a", "x", "2026-09-20T10:00:00.000Z"),
      pre("b", "x", "2026-09-20T10:00:01.000Z"),
      pre("a", "y", "2026-09-20T10:00:02.000Z"),
      pre("b", "y", "2026-09-20T10:00:03.000Z"),
      pre("a", "z", "2026-09-20T10:00:04.000Z"),
    ];

    const sessions = groupSessions(events);
    const patterns = mineNgrams(sessions, { minLen: 2, maxLen: 2 });
    const bySteps = new Map(patterns.map((p) => [p.steps.join(">"), p]));

    expect(bySteps.get("x>y")?.occurrences).toHaveLength(2);
    expect(bySteps.get("x>y")?.occurrences.map((o) => o.session).sort()).toEqual(["a", "b"]);
    expect(bySteps.get("y>z")?.occurrences).toHaveLength(1);
    expect(bySteps.get("y>z")?.occurrences[0]?.session).toBe("a");
    // z (session a) followed by x (session b) must never appear as a window.
    expect(bySteps.has("z>x")).toBe(false);
  });

  it("yields no pattern for a session shorter than minLen", () => {
    const events = [pre("a", "x", "2026-09-20T10:00:00.000Z")];
    const sessions = groupSessions(events);
    const patterns = mineNgrams(sessions, { minLen: 2, maxLen: 4 });
    expect(patterns).toEqual([]);
  });

  it("marks a step successful when unmatched, and reflects a matched PostToolUse.ok", () => {
    const events = [
      pre("a", "x", "2026-09-20T10:00:00.000Z"),
      post("a", "x", "2026-09-20T10:00:01.000Z", false),
      pre("a", "y", "2026-09-20T10:00:02.000Z"),
      // no PostToolUse for y — unmatched, counts as successful.
    ];
    const sessions = groupSessions(events);
    const [pattern] = mineNgrams(sessions, { minLen: 2, maxLen: 2 });
    expect(pattern?.occurrences[0]?.stepsOk).toEqual([false, true]);
  });
});
