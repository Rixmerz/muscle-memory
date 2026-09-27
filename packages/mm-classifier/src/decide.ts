/**
 * Input mapping and the one rule that turns Laya's answers into an outcome.
 * Pure: no I/O, so every branch is testable without a model.
 */
import type { Definition, Question } from "./definition.js";

/** One Laya answer, as `predict()` returns it under `answers.<key>`. */
export interface LayaAnswer {
  type?: string;
  choice?: string;
  score?: number;
  noul?: number;
  legend?: Record<string, string>;
  answer_confidence?: number;
  [extra: string]: unknown;
}

export interface Decision {
  classifier: string;
  outcome: string;
  reason: "rule" | "routed" | "unrouted" | "low-confidence";
  label: string;
  confidence: number;
  answers: Record<string, LayaAnswer>;
  model: string | null;
  /** The decision of the classifier `decide.next` pointed to; its outcome is this one's. */
  next?: Decision;
}

/** `a.b.c` into a JSON value; `undefined` when any segment is missing. */
export function getPath(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of path.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** The state Laya sees: the mapped keys, or the whole input when unmapped. */
export function buildState(definition: Definition, input: unknown): unknown {
  if (definition.input === undefined) return input;
  const state: Record<string, unknown> = {};
  for (const [key, path] of Object.entries(definition.input)) state[key] = getPath(input, path);
  return state;
}

/** The label of the first rule whose every pattern matches the state, else `null`. */
export function ruleLabel(definition: Definition, state: unknown): string | null {
  for (const rule of definition.rules ?? []) {
    const hit = Object.entries(rule.match).every(([key, pattern]) => {
      const value = getPath(state, key);
      return new RegExp(pattern, "i").test(value === undefined || value === null ? "" : String(value));
    });
    if (hit) return rule.label;
  }
  return null;
}

/** A rule decides with certainty and without asking Laya anything. */
export function decideByRule(definition: Definition, label: string): Decision {
  const outcome = definition.decide.routes?.[label] ?? definition.decide.fallback;
  return { classifier: definition.name, outcome, reason: "rule", label, confidence: 1, answers: {}, model: null };
}

/** Label and confidence of one answer, under the classifier's own threshold. */
export function readAnswer(
  question: Question,
  answer: LayaAnswer,
  threshold: number,
): { label: string; confidence: number } {
  if (question.type === "noul") {
    const p = answer.noul;
    if (typeof p !== "number") throw new Error("Laya answer has no noul probability");
    // With a custom threshold the chosen side can differ from Laya's own, so
    // its confidence is recomputed rather than read from answer_confidence.
    return p >= threshold ? { label: "true", confidence: p } : { label: "false", confidence: 1 - p };
  }
  const confidence = answer.answer_confidence;
  if (typeof confidence !== "number") throw new Error("Laya answer has no answer_confidence");
  if (question.type === "choice") {
    if (typeof answer.choice !== "string") throw new Error("Laya answer has no choice");
    return { label: answer.choice, confidence };
  }
  if (typeof answer.score !== "number") throw new Error("Laya answer has no score");
  const options = question.criteria as string[];
  const index = Math.min(Math.max(Math.round(answer.score), 0), options.length - 1);
  return { label: answer.legend?.[String(index)] ?? options[index]!, confidence };
}

export function decide(
  definition: Definition,
  answers: Record<string, LayaAnswer>,
  model: string | null,
): Decision {
  const { decide: rule } = definition;
  const answer = answers[rule.question];
  if (answer === undefined) throw new Error(`Laya returned no answer for "${rule.question}"`);
  const { label, confidence } = readAnswer(
    definition.questions[rule.question]!,
    answer,
    rule.threshold ?? 0.5,
  );

  let outcome = rule.fallback;
  let reason: Decision["reason"] = "unrouted";
  if (confidence < (rule.minConfidence ?? 0)) {
    reason = "low-confidence";
  } else if (rule.routes?.[label] !== undefined) {
    outcome = rule.routes[label];
    reason = "routed";
  }

  return { classifier: definition.name, outcome, reason, label, confidence, answers, model };
}
