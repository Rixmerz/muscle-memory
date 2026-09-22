import { describe, expect, it } from "vitest";
import { formatProposal } from "./proposal.js";
import type { ScoredPattern } from "@muscle-memory/aggregator/dist/candidates.js";
import type { Occurrence } from "@muscle-memory/aggregator/dist/sequences.js";

function occurrence(overrides: Partial<Occurrence> = {}): Occurrence {
  return {
    session: "s1",
    startTs: "2026-09-20T10:00:00.000Z",
    argHash: "aaaaaaaaaaaa",
    stepsOk: [true, true],
    ...overrides,
  };
}

function candidate(overrides: Partial<ScoredPattern> = {}): ScoredPattern {
  return {
    steps: ["bash:pnpm-test", "bash:pnpm-test"],
    occurrences: [occurrence()],
    score: 0.85,
    sessions: 1,
    ...overrides,
  };
}

describe("formatProposal", () => {
  it("classifies an all-identical bash:* step sequence as a hook", () => {
    const c = candidate({ steps: ["bash:pnpm-test", "bash:pnpm-test", "bash:pnpm-test"] });
    expect(formatProposal(c).target).toBe("hook");
  });

  it("classifies a mixed-tool sequence as a slash-command", () => {
    const c = candidate({
      steps: ["bash:pnpm-test", "edit:java"],
      occurrences: [occurrence({ stepsOk: [true, true] })],
    });
    expect(formatProposal(c).target).toBe("slash-command");
  });

  it("classifies an all-identical non-bash step sequence as a slash-command", () => {
    const c = candidate({ steps: ["edit:java", "edit:java"] });
    expect(formatProposal(c).target).toBe("slash-command");
  });

  it("renders markdown containing all six factor names and values", () => {
    const c = candidate({ score: 0.85 });
    const { markdown } = formatProposal(c);

    for (const name of [
      "frecuencia",
      "consistencia",
      "repeticionTemporal",
      "exito",
      "determinismo",
      "ahorroPotencial",
    ]) {
      expect(markdown).toContain(name);
    }
    expect(markdown).toContain("0.85");
  });
});
