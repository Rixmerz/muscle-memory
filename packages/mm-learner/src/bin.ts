#!/usr/bin/env node
/**
 * `mm propose [--min-score 0.8] [--write]` — calls
 * `@muscle-memory/aggregator`'s `candidates()` directly and renders each
 * result as a markdown proposal via `formatProposal` (design.md). This file
 * does not read `.mm/events/`, mine sequences, or score patterns itself
 * (spec.md).
 *
 * `candidates` and `ScoredPattern` are imported from
 * `@muscle-memory/aggregator/dist/candidates.js` rather than the package's
 * public entry point: `packages/mm-aggregator/src/index.ts` is currently an
 * empty stub (`export {}`) that re-exports nothing, and this change's
 * constraints forbid editing anything under `packages/mm-aggregator/`. The
 * deep import resolves because that package's `package.json` has no
 * `exports` map to restrict subpath resolution — unlike `@muscle-memory/core`,
 * which does. Exporting `candidates`/`ScoredPattern` from that barrel, the
 * way `@muscle-memory/core`'s already does for its own modules, is a
 * one-line follow-up for whoever owns `mm-aggregator`; see the report for
 * this change.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { candidates, type ScoredPattern } from "@muscle-memory/aggregator/dist/candidates.js";
import { formatProposal } from "./proposal.js";

const DEFAULT_MIN_SCORE = 0.8;

function parseArgs(argv: readonly string[]): { minScore: number; write: boolean } {
  let minScore = DEFAULT_MIN_SCORE;
  let write = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--min-score") {
      const raw = argv[i + 1];
      const parsed = raw !== undefined ? Number(raw) : NaN;
      if (Number.isFinite(parsed)) minScore = parsed;
      i++;
    } else if (arg === "--write") {
      write = true;
    }
  }

  return { minScore, write };
}

/** Kebab-cased, truncated slug of a candidate's step sequence (design.md). */
function slugify(candidate: ScoredPattern): string {
  const slug = candidate.steps
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, 60);
}

function writeProposal(root: string, candidate: ScoredPattern, markdown: string): void {
  const date = new Date().toISOString().slice(0, 10);
  const dir = join(root, ".mm", "proposals");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${date}-${slugify(candidate)}.md`), markdown);
}

function main(): void {
  const { minScore, write } = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const results = candidates(root, { minScore });

  for (const candidate of results) {
    const proposal = formatProposal(candidate);
    process.stdout.write(proposal.markdown);
    if (write) writeProposal(root, candidate, proposal.markdown);
  }

  process.exit(0);
}

main();
