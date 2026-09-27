import { describe, expect, it } from "vitest";
import { labelsOf, validate } from "./definition.js";

function valid(): Record<string, any> {
  return {
    name: "bash-risk",
    description: "How risky is a shell command",
    questions: {
      risk: {
        type: "choice",
        instructions: "How risky is this command?",
        criteria: { safe: "read-only", destructive: "deletes data" },
      },
    },
    decide: { question: "risk", routes: { destructive: "deny" }, fallback: "continue", minConfidence: 0.6 },
    examples: [{ input: { command: "rm -rf /" }, expect: "destructive" }],
  };
}

describe("validate", () => {
  it("accepts a valid definition", () => {
    expect(validate(valid()).name).toBe("bash-risk");
  });

  it("rejects a non-kebab name", () => {
    expect(() => validate({ ...valid(), name: "Bash_Risk" })).toThrow(/^name:/);
  });

  it("rejects an empty questions object", () => {
    expect(() => validate({ ...valid(), questions: {} })).toThrow(/^questions:/);
  });

  it("rejects an unknown question type", () => {
    const d = valid();
    d.questions.risk.type = "free";
    expect(() => validate(d)).toThrow(/questions\.risk\.type/);
  });

  it("rejects missing instructions", () => {
    const d = valid();
    d.questions.risk.instructions = " ";
    expect(() => validate(d)).toThrow(/questions\.risk\.instructions/);
  });

  it("rejects a noul question whose criteria are not exactly true/false", () => {
    const d = valid();
    d.questions.risk = { type: "noul", instructions: "Destructive?", criteria: { yes: "a", no: "b" } };
    d.decide.routes = {};
    expect(() => validate(d)).toThrow(/questions\.risk\.criteria.*"true" and "false"/);
  });

  it("rejects a score question whose criteria are not an array of strings", () => {
    const d = valid();
    d.questions.risk = { type: "score", instructions: "Urgency?", criteria: { low: "x", high: "y" } };
    expect(() => validate(d)).toThrow(/questions\.risk\.criteria.*array/);
  });

  it("accepts null descriptions and a plain label list for choice, and a noul without criteria", () => {
    const d = valid();
    d.questions.risk.criteria = { safe: null, destructive: "deletes data" };
    expect(validate(d).name).toBe("bash-risk");
    d.questions.risk.criteria = ["safe", "destructive"];
    expect(validate(d).name).toBe("bash-risk");
    d.questions.risk = { type: "noul", instructions: "Destructive?" };
    d.decide.routes = {};
    d.examples = [];
    expect(validate(d).name).toBe("bash-risk");
  });

  it("rejects noul labels without true and false", () => {
    const d = valid();
    d.questions.risk = { type: "noul", instructions: "?", criteria: { true: "a", false: "b" }, labels: { yes: "A", no: "B" } };
    d.decide.routes = {};
    d.examples = [];
    expect(() => validate(d)).toThrow(/questions\.risk\.labels/);
  });

  it("rejects a choice question with one label", () => {
    const d = valid();
    d.questions.risk.criteria = { safe: "x" };
    expect(() => validate(d)).toThrow(/at least two labels/);
  });

  it("rejects decide.question naming no question", () => {
    const d = valid();
    d.decide.question = "nope";
    expect(() => validate(d)).toThrow(/^decide\.question/);
  });

  it("rejects an empty fallback", () => {
    const d = valid();
    d.decide.fallback = "";
    expect(() => validate(d)).toThrow(/^decide\.fallback/);
  });

  it("rejects a route key the question cannot produce", () => {
    const d = valid();
    d.decide.routes = { risky: "ask" };
    expect(() => validate(d)).toThrow(/decide\.routes\.risky/);
  });

  it("rejects minConfidence outside [0, 1]", () => {
    const d = valid();
    d.decide.minConfidence = 1.5;
    expect(() => validate(d)).toThrow(/decide\.minConfidence/);
  });

  it("rejects an example expecting an unknown label", () => {
    const d = valid();
    d.examples = [{ input: {}, expect: "maybe" }];
    expect(() => validate(d)).toThrow(/examples\[0\]\.expect/);
  });

  it("rejects a non-string input path", () => {
    expect(() => validate({ ...valid(), input: { command: 3 } })).toThrow(/^input:/);
  });
});

describe("validate: rules and next", () => {
  it("accepts rules and next that name the deciding question's labels", () => {
    const d = { ...valid(), rules: [{ match: { email: "@inacap\\.cl$" }, label: "safe" }], decide: { ...valid().decide, next: { safe: "other" } } };
    expect(validate(d).rules).toHaveLength(1);
  });

  it("rejects a rule with an unknown label", () => {
    expect(() => validate({ ...valid(), rules: [{ match: { a: "x" }, label: "nope" }] })).toThrow(/rules\[0\]\.label/);
  });

  it("rejects a rule with an empty match or a bad regex", () => {
    expect(() => validate({ ...valid(), rules: [{ match: {}, label: "safe" }] })).toThrow(/rules\[0\]\.match/);
    expect(() => validate({ ...valid(), rules: [{ match: { a: "(" }, label: "safe" }] })).toThrow(/not a valid regex/);
  });

  it("rejects next on a label the question cannot produce", () => {
    const d = valid();
    d.decide.next = { risky: "other" };
    expect(() => validate(d)).toThrow(/decide\.next\.risky/);
  });
});

describe("labelsOf", () => {
  it("lists labels per question type", () => {
    expect(labelsOf({ type: "choice", instructions: "", criteria: { a: "", b: "" } })).toEqual(["a", "b"]);
    expect(labelsOf({ type: "score", instructions: "", criteria: ["low", "high"] })).toEqual(["low", "high"]);
    expect(labelsOf({ type: "noul", instructions: "", criteria: { true: "", false: "" } })).toEqual(["true", "false"]);
  });
});
