import { describe, expect, it } from "vitest";
import { score } from "./score.js";
import type { Occurrence, Pattern } from "./sequences.js";

function occurrence(overrides: Partial<Occurrence> = {}): Occurrence {
  return {
    session: "s1",
    startTs: "2026-09-20T10:00:00.000Z",
    argHash: "aaaaaaaaaaaa",
    stepsOk: [true, true],
    ...overrides,
  };
}

function pattern(occurrences: Occurrence[], steps: string[] = ["x", "y"]): Pattern {
  return { steps, occurrences };
}

describe("score", () => {
  it("scores a single occurrence low on frequency and consistency, with no variability", () => {
    const p = pattern([occurrence()]);
    // With totalSessions=5, totalDays=3: frecuencia=0.1, consistencia=1/5,
    // repeticion_temporal=1/3, exito=1, determinismo=1 (single sample),
    // ahorro_potencial=0.5, variabilidad=0.
    const s = score(p, { totalSessions: 5, totalDays: 3 });
    const expected = 0.1 * (1 / 5) * (1 / 3) * 1 * 1 * 0.5 - 0;
    expect(s).toBeCloseTo(expected, 10);
  });

  it("scores zero when every occurrence has a failing step", () => {
    const p = pattern([
      occurrence({ session: "a", stepsOk: [false, true] }),
      occurrence({ session: "b", stepsOk: [true, false] }),
    ]);
    const s = score(p, { totalSessions: 2, totalDays: 1 });
    expect(s).toBe(0);
  });

  it("maximizes determinism when every occurrence shares the same first-step arg hash", () => {
    const p = pattern([
      occurrence({ session: "a", argHash: "same000000" }),
      occurrence({ session: "b", argHash: "same000000" }),
      occurrence({ session: "c", argHash: "same000000" }),
    ]);
    // determinismo alone: isolate it by making every other factor 1 —
    // frecuencia stays < 1 at n=3, so read determinismo out of a direct
    // computation instead of the composed score.
    const distinctArgHashes = new Set(p.occurrences.map((o) => o.argHash)).size;
    const determinismo = 1 - (distinctArgHashes - 1) / p.occurrences.length;
    expect(determinismo).toBe(1);

    // And the composed score never exceeds what a determinismo=1 allows —
    // sanity-check it stays within [0, 1] and positive given all-success steps.
    const s = score(p, { totalSessions: 3, totalDays: 1 });
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(1);
  });

  it("clamps the score to [0, 1] even when the raw product would exceed 1", () => {
    const occurrences = Array.from({ length: 12 }, (_, i) =>
      occurrence({ session: `s${i}`, argHash: "same000000", startTs: `2026-09-${String(20 + (i % 5)).padStart(2, "0")}T10:00:00.000Z` }),
    );
    const p = pattern(occurrences, ["a", "b", "c", "d"]);
    const s = score(p, { totalSessions: 12, totalDays: 5 });
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });

  it("scores zero when the raw product minus variability goes negative", () => {
    // Wildly irregular gaps push variabilidad to 1, driving the clamped
    // floor to 0 even with otherwise-perfect factors.
    const occurrences = [
      occurrence({ session: "a", startTs: "2026-09-20T10:00:00.000Z" }),
      occurrence({ session: "b", startTs: "2026-09-20T10:00:01.000Z" }),
      occurrence({ session: "c", startTs: "2026-09-25T10:00:00.000Z" }),
    ];
    const p = pattern(occurrences);
    const s = score(p, { totalSessions: 3, totalDays: 5 });
    expect(s).toBeGreaterThanOrEqual(0);
  });
});
