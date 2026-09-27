import { describe, expect, it } from "vitest";
import { buildState, decide, decideByRule, getPath, ruleLabel } from "./decide.js";
import type { Definition } from "./definition.js";

const CHOICE: Definition = {
  name: "bash-risk",
  description: "",
  questions: {
    risk: { type: "choice", instructions: "Risk?", criteria: { safe: "", destructive: "" } },
  },
  decide: { question: "risk", routes: { destructive: "deny" }, fallback: "continue", minConfidence: 0.6 },
};

describe("input mapping", () => {
  it("builds the state from dot paths", () => {
    const d = { ...CHOICE, input: { command: "tool_input.command" } };
    expect(buildState(d, { tool_input: { command: "ls" } })).toEqual({ command: "ls" });
  });

  it("passes the whole input through without a mapping", () => {
    expect(buildState(CHOICE, { text: "hi" })).toEqual({ text: "hi" });
  });

  it("yields undefined for a missing path", () => {
    expect(getPath({ a: 1 }, "a.b.c")).toBeUndefined();
  });
});

describe("decide", () => {
  it("routes a confident choice", () => {
    const d = decide(CHOICE, { risk: { choice: "destructive", answer_confidence: 0.88 } }, "english");
    expect(d).toMatchObject({ outcome: "deny", reason: "routed", label: "destructive", confidence: 0.88, model: "english" });
  });

  it("falls back below minConfidence", () => {
    const d = decide(CHOICE, { risk: { choice: "destructive", answer_confidence: 0.4 } }, null);
    expect(d).toMatchObject({ outcome: "continue", reason: "low-confidence", label: "destructive" });
  });

  it("falls back on a label with no route", () => {
    const d = decide(CHOICE, { risk: { choice: "safe", answer_confidence: 0.9 } }, null);
    expect(d).toMatchObject({ outcome: "continue", reason: "unrouted", label: "safe" });
  });

  it("applies the noul threshold and recomputes confidence", () => {
    const def: Definition = {
      ...CHOICE,
      questions: { human: { type: "noul", instructions: "Confirm?", criteria: { true: "", false: "" } } },
      decide: { question: "human", routes: { true: "ask" }, fallback: "continue", threshold: 0.7 },
    };
    const below = decide(def, { human: { noul: 0.65 } }, null);
    expect(below.label).toBe("false");
    expect(below.confidence).toBeCloseTo(0.35);
    const above = decide(def, { human: { noul: 0.75 } }, null);
    expect(above).toMatchObject({ label: "true", outcome: "ask", reason: "routed" });
  });

  it("labels a score by its rounded legend entry", () => {
    const def: Definition = {
      ...CHOICE,
      questions: { urgency: { type: "score", instructions: "Urgency?", criteria: ["low", "medium", "high"] } },
      decide: { question: "urgency", routes: { high: "escalate" }, fallback: "continue" },
    };
    const legend = { "0": "low", "1": "medium", "2": "high" };
    expect(decide(def, { urgency: { score: 1.6, legend, answer_confidence: 0.7 } }, null)).toMatchObject({
      label: "high",
      outcome: "escalate",
    });
    expect(decide(def, { urgency: { score: 9, answer_confidence: 0.7 } }, null).label).toBe("high");
  });

  it("throws when the deciding answer is missing", () => {
    expect(() => decide(CHOICE, {}, null)).toThrow(/no answer for "risk"/);
  });

  it("throws when a choice answer has no confidence", () => {
    expect(() => decide(CHOICE, { risk: { choice: "safe" } }, null)).toThrow(/answer_confidence/);
  });
});

describe("rules", () => {
  const def: Definition = {
    ...CHOICE,
    rules: [
      { match: { email: "@inacap\\.cl$", subject: "liquidaci" }, label: "safe" },
      { match: { email: "@bancochile\\.cl$" }, label: "destructive" },
    ],
  };

  it("needs every pattern of a rule to match, case-insensitively", () => {
    expect(ruleLabel(def, { email: "a@inacap.cl", subject: "LIQUIDACIÓN" })).toBe("safe");
    expect(ruleLabel(def, { email: "a@inacap.cl", subject: "reunión" })).toBeNull();
  });

  it("takes the first matching rule and treats missing fields as empty", () => {
    expect(ruleLabel(def, { email: "x@bancochile.cl" })).toBe("destructive");
    expect(ruleLabel(def, {})).toBeNull();
  });

  it("decides with certainty and routes the label", () => {
    expect(decideByRule(def, "destructive")).toMatchObject({ reason: "rule", confidence: 1, outcome: "deny", answers: {} });
    expect(decideByRule(def, "safe").outcome).toBe("continue");
  });
});
