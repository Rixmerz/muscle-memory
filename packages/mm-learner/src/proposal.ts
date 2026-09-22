/**
 * Classifies and renders a scored candidate as a markdown proposal
 * (design.md).
 *
 * `ScoredPattern`, as returned by `@muscle-memory/aggregator`'s
 * `candidates()`, carries the composite `score` and this pattern's own
 * `sessions` count, but not the six individual factor inputs `score.ts`
 * computes it from, nor the `CorpusStats` (`totalSessions`, `totalDays`) two
 * of those factors are normalised against — neither is exported by the
 * aggregator package, and this change's constraints forbid adding it there.
 * `formatProposal` renders four factors purely as a function of the
 * candidate itself (`frecuencia`, `exito`, `determinismo`,
 * `ahorroPotencial`), using the exact formulas `score.ts` pins. For
 * `consistencia` and `repeticionTemporal`, whose formulas divide by a corpus
 * total unavailable here, it reports the raw numerator each formula uses
 * instead — `sessions` observed and distinct days observed — rather than a
 * fabricated ratio. See the report for this change.
 */
import type { ScoredPattern } from "@muscle-memory/aggregator/dist/candidates.js";

export type TargetKind = "hook" | "slash-command";

export interface Proposal {
  target: TargetKind;
  markdown: string;
}

const RATIONALE: Record<TargetKind, string> = {
  hook: "Every occurrence runs the identical bash command, so this pattern can fire unattended as a hook.",
  "slash-command":
    "This pattern mixes tools or commands, so it needs a human to trigger it as a slash command rather than firing automatically.",
};

function classify(candidate: ScoredPattern): TargetKind {
  const [first, ...rest] = candidate.steps;
  const allIdenticalBash =
    first !== undefined && first.startsWith("bash:") && rest.every((step) => step === first);
  return allIdenticalBash ? "hook" : "slash-command";
}

interface Factor {
  readonly name: string;
  readonly value: number;
}

function factors(candidate: ScoredPattern): readonly Factor[] {
  const occurrences = candidate.occurrences;
  const n = occurrences.length;

  const frecuencia = Math.min(1, n / 10);
  const exito = occurrences.filter((o) => o.stepsOk.every(Boolean)).length / n;
  const distinctArgHashes = new Set(occurrences.map((o) => o.argHash)).size;
  const determinismo = 1 - (distinctArgHashes - 1) / n;
  const ahorroPotencial = candidate.steps.length / 4;
  const distinctDays = new Set(occurrences.map((o) => o.startTs.slice(0, 10))).size;

  return [
    { name: "frecuencia", value: frecuencia },
    { name: "consistencia", value: candidate.sessions },
    { name: "repeticionTemporal", value: distinctDays },
    { name: "exito", value: exito },
    { name: "determinismo", value: determinismo },
    { name: "ahorroPotencial", value: ahorroPotencial },
  ];
}

function render(candidate: ScoredPattern, target: TargetKind): string {
  const factorRows = factors(candidate)
    .map((f) => `| ${f.name} | ${f.value.toFixed(2)} |`)
    .join("\n");

  return `# Pattern: ${candidate.steps.join(" -> ")}

## Steps

\`\`\`
${candidate.steps.join("\n")}
\`\`\`

## Score: ${candidate.score.toFixed(2)}

| Factor | Value |
|---|---|
${factorRows}

## Suggested target: \`${target}\`

${RATIONALE[target]}
`;
}

export function formatProposal(candidate: ScoredPattern): Proposal {
  const target = classify(candidate);
  return { target, markdown: render(candidate, target) };
}
