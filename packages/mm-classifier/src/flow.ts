/**
 * Runs one classifier and, when its label names a `decide.next`, the
 * classifier after it — so "which sender" can hand over to "which bank",
 * then to "what kind of bank notice". A rule hit never calls Laya, so a
 * chain made of rules needs no server at all.
 */
import { dirname, resolve } from "node:path";
import { buildState, decide, decideByRule, ruleLabel, type Decision } from "./decide.js";
import { predict } from "./laya.js";
import { loadDefinition } from "./store.js";

export const MAX_DEPTH = 5;

export interface FlowOptions {
  url: string;
  timeoutMs?: number | undefined;
  /** `false` decides this classifier alone, as `test` does. */
  follow?: boolean;
}

/** A `next` ref: a path when it looks like one, else a sibling `<name>.json`. */
export function resolveNext(fromPath: string, ref: string): string {
  const base = dirname(fromPath);
  return ref.includes("/") || ref.endsWith(".json") ? resolve(base, ref) : resolve(base, `${ref}.json`);
}

export async function evaluate(
  path: string,
  input: unknown,
  options: FlowOptions,
  chain: readonly string[] = [],
): Promise<Decision> {
  if (chain.includes(path)) throw new Error(`classifier cycle: ${[...chain, path].join(" -> ")}`);
  if (chain.length >= MAX_DEPTH) throw new Error(`classifier chain deeper than ${MAX_DEPTH}: ${chain.join(" -> ")}`);

  const definition = loadDefinition(path);
  const state = buildState(definition, input);
  const label = ruleLabel(definition, state);
  let decision: Decision;
  if (label !== null) {
    decision = decideByRule(definition, label);
  } else {
    const { answers, model } = await predict(options.url, definition, state, options.timeoutMs);
    decision = decide(definition, answers, model);
  }

  // A low-confidence label is not trusted enough to pick the next classifier.
  const nextRef = decision.reason === "low-confidence" ? undefined : definition.decide.next?.[decision.label];
  if (nextRef === undefined || options.follow === false) return decision;
  const next = await evaluate(resolveNext(path, nextRef), input, options, [...chain, path]);
  return { ...decision, outcome: next.outcome, next };
}
