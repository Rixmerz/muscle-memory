#!/usr/bin/env node
/**
 * `mm candidates [--min-score 0.8] [--json]` — reads the current
 * repository's `.mm/events/`, prints patterns at or above the score
 * threshold, ordered by score descending, and exits 0. No `.mm/` or no
 * events: exits 0 with no output (spec.md).
 */
import { candidates, type ScoredPattern } from "./candidates.js";

const DEFAULT_MIN_SCORE = 0.8;

function parseArgs(argv: readonly string[]): { minScore: number; json: boolean } {
  let minScore = DEFAULT_MIN_SCORE;
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--min-score") {
      const raw = argv[i + 1];
      const parsed = raw !== undefined ? Number(raw) : NaN;
      if (Number.isFinite(parsed)) minScore = parsed;
      i++;
    } else if (arg === "--json") {
      json = true;
    }
  }

  return { minScore, json };
}

function printJson(results: readonly ScoredPattern[]): void {
  const rows = results.map((r) => ({
    steps: r.steps,
    score: r.score,
    occurrences: r.occurrences.length,
    sessions: r.sessions,
  }));
  process.stdout.write(`${JSON.stringify(rows)}\n`);
}

function printText(results: readonly ScoredPattern[]): void {
  for (const r of results) {
    process.stdout.write(
      `${r.score.toFixed(2)}  ${r.steps.join(" -> ")}  (${r.occurrences.length} occurrences, ${r.sessions} sessions)\n`,
    );
  }
}

function main(): void {
  const { minScore, json } = parseArgs(process.argv.slice(2));
  const results = candidates(process.cwd(), { minScore });

  if (json) {
    printJson(results);
  } else {
    printText(results);
  }

  process.exit(0);
}

main();
