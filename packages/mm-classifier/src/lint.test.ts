import { describe, expect, it } from "vitest";
import type { Definition } from "./definition.js";
import { lint } from "./lint.js";

function def(question: Record<string, unknown>, extra: Partial<Definition> = {}): Definition {
  return {
    name: "x",
    description: "",
    input: { body: "text" },
    questions: { q: question as unknown as Definition["questions"][string] },
    decide: { question: "q", fallback: "f" },
    ...extra,
  };
}

const CANONICAL = {
  type: "choice",
  instructions: "What kind of email is in `body`?",
  criteria: { bulk: "newsletter or marketing", personal: "written by a person", other: "none of the other options fits" },
};

describe("lint", () => {
  it("is silent on a canonical choice question", () => {
    expect(lint(def(CANONICAL))).toEqual([]);
  });

  it("wants a backticked state field, and one that exists in input", () => {
    expect(lint(def({ ...CANONICAL, instructions: "What kind of email is this?" }))[0]).toMatch(/no state field in backticks/);
    expect(lint(def({ ...CANONICAL, instructions: "What is in `message`?" }))[0]).toMatch(/`message`, which is not a key of `input`/);
  });

  it("flags noul without labels, and score", () => {
    expect(lint(def({ type: "noul", instructions: "Is `body` spam?" }))[0]).toMatch(/#156/);
    expect(lint(def({ type: "noul", instructions: "Is `body` spam?", labels: { true: "A", false: "B" } }))).toEqual([]);
    expect(lint(def({ type: "score", instructions: "How urgent is `body`?", criteria: ["low", "high"] }))[0]).toMatch(/weakest primitive/);
  });

  it("flags boolean-word labels, too many options, and a missing catch-all", () => {
    expect(lint(def({ type: "choice", instructions: "Is `body` ok?", criteria: { yes: "", no: "" } }))[0]).toMatch(/boolean-word labels \(yes, no\)/);
    const many = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`l${i}`, ""]));
    const w = lint(def({ type: "choice", instructions: "Which in `body`?", criteria: many }));
    expect(w.some((x) => /12 options; keep a question to about 10/.test(x))).toBe(true);
    expect(w.some((x) => /no catch-all/.test(x))).toBe(true);
    const huge = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`l${i}`, ""]));
    expect(lint(def({ type: "choice", instructions: "Which in `body`?", criteria: { ...huge, other: "" } }))[0]).toMatch(/collapses/);
  });

  it("flags a head that overflows the token budget", () => {
    const long = { a: "x".repeat(400), b: "y".repeat(300) };
    expect(lint(def({ type: "choice", instructions: "Which in `body`?", criteria: long })).some((x) => /head budget/.test(x))).toBe(true);
  });

  it("flags non-English text pinned to the english checkpoint", () => {
    const q = { ...CANONICAL, instructions: "¿Qué tipo de correo hay en `body`?" };
    expect(lint(def(q, { model: "english" })).some((x) => /collapses outside English/.test(x))).toBe(true);
    expect(lint(def(q))).toEqual([]);
  });
});
