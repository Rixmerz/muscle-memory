import { describe, expect, it } from "vitest";
import { deriveCandidateId } from "./candidate-id.js";
import type { Pattern } from "./sequences.js";

function pattern(steps: string[], occurrenceCount: number): Pattern {
  return {
    steps,
    occurrences: Array.from({ length: occurrenceCount }, (_, i) => ({
      session: `s${i}`,
      startTs: "2026-01-01T00:00:00.000Z",
      argHash: "abc",
      stepsOk: steps.map(() => true),
    })),
  };
}

describe("deriveCandidateId", () => {
  it("is stable for the same steps and occurrence count", () => {
    const a = deriveCandidateId(pattern(["bash:pnpm-test"], 3));
    const b = deriveCandidateId(pattern(["bash:pnpm-test"], 3));
    expect(a).toBe(b);
  });

  it("differs when steps change", () => {
    const a = deriveCandidateId(pattern(["bash:pnpm-test"], 3));
    const b = deriveCandidateId(pattern(["bash:pnpm-lint"], 3));
    expect(a).not.toBe(b);
  });

  it("differs when occurrence count changes", () => {
    const a = deriveCandidateId(pattern(["bash:pnpm-test"], 3));
    const b = deriveCandidateId(pattern(["bash:pnpm-test"], 4));
    expect(a).not.toBe(b);
  });
});
