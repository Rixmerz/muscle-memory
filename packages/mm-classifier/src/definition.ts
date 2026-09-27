/**
 * The classifier definition: Laya's own `questions`, passed through verbatim,
 * plus the thin `decide` block Laya has no notion of (which answer decides,
 * the confidence floor, label -> outcome routes, the fallback). Validation
 * mirrors Laya's own schema rules so a bad definition fails here, at write
 * time, not as a 422 from the server in the middle of a hook.
 */

export type QuestionType = "choice" | "score" | "noul";

export interface Question {
  type: QuestionType;
  instructions: string;
  /** `choice`: label -> description (null: the label alone), or a list of labels.
   * `score`: ordered options. `noul`: optional `{true, false}`. */
  criteria?: Record<string, string | null> | string[];
  [extra: string]: unknown;
}

export interface Decide {
  question: string;
  fallback: string;
  routes?: Record<string, string>;
  /** Label -> classifier (name or path, relative to this definition's directory) to run next. */
  next?: Record<string, string>;
  minConfidence?: number;
  /** `noul` only: P(true) at or above this is the label `"true"`. */
  threshold?: number;
}

/** Every `match` entry (state key or dot path -> case-insensitive regex) must hit. */
export interface Rule {
  match: Record<string, string>;
  label: string;
}

export interface Example {
  input: unknown;
  expect: string;
}

export interface Definition {
  name: string;
  description: string;
  questions: Record<string, Question>;
  decide: Decide;
  /** State key -> dot path into the input. Absent: the whole input is the state. */
  input?: Record<string, string>;
  /** Checked in order before Laya; the first hit decides without a model call. */
  rules?: Rule[];
  model?: string;
  examples?: Example[];
}

export const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const QUESTION_TYPES: readonly string[] = ["choice", "score", "noul"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inUnitRange(value: unknown): boolean {
  return typeof value === "number" && value >= 0 && value <= 1;
}

/** Every label a question can produce: criteria keys for `choice`, the
 * options for `score` (Laya's legend), `"true"`/`"false"` for `noul`. */
export function labelsOf(question: Question): string[] {
  if (question.type === "noul") return ["true", "false"];
  if (Array.isArray(question.criteria)) return [...question.criteria];
  return Object.keys(question.criteria ?? {});
}

function validateQuestion(key: string, raw: unknown): void {
  const at = `questions.${key}`;
  if (!isObject(raw)) throw new Error(`${at}: must be an object`);
  if (typeof raw.type !== "string" || !QUESTION_TYPES.includes(raw.type)) {
    throw new Error(`${at}.type: must be one of choice, score, noul`);
  }
  if (typeof raw.instructions !== "string" || raw.instructions.trim() === "") {
    throw new Error(`${at}.instructions: must be a non-empty string`);
  }
  const criteria = raw.criteria;
  if (raw.type === "score") {
    if (!Array.isArray(criteria) || criteria.length < 2 || !criteria.every((c) => typeof c === "string")) {
      throw new Error(`${at}.criteria: a score question needs an array of at least two strings`);
    }
    return;
  }
  if (raw.type === "noul") {
    // Laya's own default is used when a noul has no criteria.
    if (criteria === undefined) return;
    const keys = isObject(criteria) ? Object.keys(criteria) : [];
    if (!isObject(criteria) || keys.length !== 2 || !("true" in criteria) || !("false" in criteria) ||
        !Object.values(criteria).every((c) => typeof c === "string")) {
      throw new Error(`${at}.criteria: a noul question needs exactly the keys "true" and "false"`);
    }
    if (raw.labels !== undefined) {
      const labels = raw.labels;
      if (!isObject(labels) || Object.keys(labels).length !== 2 || !("true" in labels) || !("false" in labels)) {
        throw new Error(`${at}.labels: must have exactly the keys "true" and "false"`);
      }
    }
    return;
  }
  // choice: an object of label -> description (null for none), or a list of labels.
  const labels = Array.isArray(criteria)
    ? criteria.every((c) => typeof c === "string") ? criteria : null
    : isObject(criteria) && Object.values(criteria).every((c) => typeof c === "string" || c === null)
      ? Object.keys(criteria)
      : null;
  if (labels === null) {
    throw new Error(`${at}.criteria: a choice question needs an object of label -> description (or null), or a list of labels`);
  }
  if (labels.length < 2) {
    throw new Error(`${at}.criteria: a choice question needs at least two labels`);
  }
}

function validateDecide(raw: unknown, questions: Record<string, Question>): void {
  if (!isObject(raw)) throw new Error("decide: must be an object");
  if (typeof raw.question !== "string" || !(raw.question in questions)) {
    throw new Error(`decide.question: must name one of the questions (${Object.keys(questions).join(", ")})`);
  }
  if (typeof raw.fallback !== "string" || raw.fallback === "") {
    throw new Error("decide.fallback: must be a non-empty string");
  }
  for (const field of ["minConfidence", "threshold"] as const) {
    if (raw[field] !== undefined && !inUnitRange(raw[field])) {
      throw new Error(`decide.${field}: must be a number in [0, 1]`);
    }
  }
  const labels = labelsOf(questions[raw.question]!);
  for (const field of ["routes", "next"] as const) {
    const map = raw[field];
    if (map === undefined) continue;
    if (!isObject(map)) throw new Error(`decide.${field}: must be an object of label -> string`);
    for (const [label, value] of Object.entries(map)) {
      if (!labels.includes(label)) {
        throw new Error(`decide.${field}.${label}: not a label of "${raw.question}" (${labels.join(", ")})`);
      }
      if (typeof value !== "string" || value === "") {
        throw new Error(`decide.${field}.${label}: must be a non-empty string`);
      }
    }
  }
}

function validateRules(raw: unknown, labels: string[]): void {
  if (!Array.isArray(raw)) throw new Error("rules: must be an array");
  raw.forEach((rule, i) => {
    const at = `rules[${i}]`;
    if (!isObject(rule) || !isObject(rule.match) || Object.keys(rule.match).length === 0) {
      throw new Error(`${at}.match: must be a non-empty object of state key -> regex`);
    }
    for (const [key, pattern] of Object.entries(rule.match)) {
      if (typeof pattern !== "string") throw new Error(`${at}.match.${key}: must be a regex string`);
      try {
        new RegExp(pattern, "i");
      } catch {
        throw new Error(`${at}.match.${key}: not a valid regex: ${pattern}`);
      }
    }
    if (typeof rule.label !== "string" || !labels.includes(rule.label)) {
      throw new Error(`${at}.label: must be a label of the deciding question (${labels.join(", ")})`);
    }
  });
}

/** Returns the input typed as a `Definition`, or throws naming the first bad field. */
export function validate(raw: unknown): Definition {
  if (!isObject(raw)) throw new Error("definition: must be a JSON object");
  if (typeof raw.name !== "string" || !NAME_PATTERN.test(raw.name)) {
    throw new Error("name: must be kebab-case (a-z, 0-9, single dashes)");
  }
  if (typeof raw.description !== "string") throw new Error("description: must be a string");
  if (!isObject(raw.questions) || Object.keys(raw.questions).length === 0) {
    throw new Error("questions: must be an object with at least one question");
  }
  for (const [key, question] of Object.entries(raw.questions)) validateQuestion(key, question);
  const questions = raw.questions as Record<string, Question>;
  validateDecide(raw.decide, questions);

  if (raw.input !== undefined) {
    if (!isObject(raw.input) || !Object.values(raw.input).every((p) => typeof p === "string")) {
      throw new Error("input: must be an object of state key -> dot path");
    }
  }
  if (raw.rules !== undefined) validateRules(raw.rules, labelsOf(questions[(raw.decide as Decide).question]!));
  if (raw.model !== undefined && typeof raw.model !== "string") throw new Error("model: must be a string");
  if (raw.examples !== undefined) {
    if (!Array.isArray(raw.examples)) throw new Error("examples: must be an array");
    const labels = labelsOf(questions[(raw.decide as Decide).question]!);
    raw.examples.forEach((example, i) => {
      if (!isObject(example) || !("input" in example) || typeof example.expect !== "string") {
        throw new Error(`examples[${i}]: must be {input, expect}`);
      }
      if (!labels.includes(example.expect)) {
        throw new Error(`examples[${i}].expect: "${example.expect}" is not a label (${labels.join(", ")})`);
      }
    });
  }
  return raw as unknown as Definition;
}
