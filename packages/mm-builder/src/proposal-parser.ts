/**
 * Extracts the two facts `buildHook` needs from a proposal file written by
 * M3's `formatProposal` (`packages/mm-learner/src/proposal.ts:66-90`): the
 * mined step signatures and the suggested target kind. That renderer emits a
 * fixed shape, so this is two regexes against that exact shape, not a
 * general markdown parse (design.md).
 */

export type TargetKind = "hook" | "slash-command";

export interface ParsedProposal {
  target: TargetKind;
  steps: string[];
}

const STEPS_BLOCK_RE = /## Steps\s*\n\s*```\n([\s\S]*?)\n```/;
const TARGET_RE = /## Suggested target: `([^`]+)`/;

export function parseProposal(markdown: string): ParsedProposal {
  const stepsMatch = STEPS_BLOCK_RE.exec(markdown);
  if (!stepsMatch) {
    throw new Error("proposal is missing a `## Steps` fenced code block");
  }

  const targetMatch = TARGET_RE.exec(markdown);
  if (!targetMatch) {
    throw new Error("proposal is missing a `## Suggested target: `<kind>`` line");
  }

  const steps = (stepsMatch[1] as string)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const target = targetMatch[1] as string;
  if (target !== "hook" && target !== "slash-command") {
    throw new Error(`proposal has an unrecognised suggested target: \`${target}\``);
  }

  return { target, steps };
}
