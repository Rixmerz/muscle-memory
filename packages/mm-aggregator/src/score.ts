/**
 * The six factors and the variability penalty, pinned in spec.md /
 * design.md.
 *
 * `determinismo`: spec.md writes `1 - (distinct_arg_hashes / occurrences)`.
 * Taken literally that formula can never reach `1` — `distinct_arg_hashes`
 * is at least `1` whenever there is at least one occurrence, so the ratio is
 * always `>= 1/occurrences` — yet the pinned scenario "identical arguments
 * across every occurrence maximize determinism" requires exactly
 * `determinismo = 1`. The two only agree once the ratio is read as counting
 * *extra* distinct hashes beyond the first: `(distinct_arg_hashes - 1) /
 * occurrences`. That reading satisfies the scenario for every occurrence
 * count, so it is what is implemented here; see the report for this change.
 */
import type { Pattern } from "./sequences.js";

export interface CorpusStats {
  totalSessions: number;
  totalDays: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdev(values: readonly number[]): number {
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

/** `gap_ms` between consecutive occurrence start timestamps; `0` for fewer than two occurrences. */
function variabilidad(occurrences: readonly Pattern["occurrences"][number][]): number {
  if (occurrences.length < 2) return 0;

  const starts = occurrences
    .map((o) => new Date(o.startTs).getTime())
    .sort((a, b) => a - b);
  const gaps = starts.slice(1).map((t, i) => t - starts[i]!);

  const gapMean = mean(gaps);
  if (gapMean === 0) return 0;

  return clamp(stdev(gaps) / gapMean, 0, 1);
}

/** Implements the six factors and the penalty, per the header note above. */
export function score(pattern: Pattern, corpus: CorpusStats): number {
  const occurrences = pattern.occurrences;
  const n = occurrences.length;

  const frecuencia = Math.min(1, n / 10);
  const consistencia = new Set(occurrences.map((o) => o.session)).size / corpus.totalSessions;
  const repeticionTemporal =
    new Set(occurrences.map((o) => o.startTs.slice(0, 10))).size / corpus.totalDays;
  const exito = occurrences.filter((o) => o.stepsOk.every(Boolean)).length / n;
  const distinctArgHashes = new Set(occurrences.map((o) => o.argHash)).size;
  const determinismo = 1 - (distinctArgHashes - 1) / n;
  const ahorroPotencial = pattern.steps.length / 4;

  const raw =
    frecuencia * consistencia * repeticionTemporal * exito * determinismo * ahorroPotencial -
    variabilidad(occurrences);

  return clamp(raw, 0, 1);
}
