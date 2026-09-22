/**
 * `SessionEnd` nudge logic: mines candidates the same way `mm run` does and,
 * if the resulting candidate id set differs from the last recorded set,
 * writes `.mm/review-pending.json`. Consent-gated on `.mm/` exactly like the
 * logger (design.md § mm-nudge.mjs). Writes nothing else, never installs.
 * Pure function, no `process.exit` — see `nudge-bin.ts` for the CLI entry.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { candidates } from "./candidates.js";
import { deriveCandidateId } from "./candidate-id.js";

const DEFAULT_MIN_SCORE = 0.8;

interface ReviewPending {
  ids: string[];
  count: number;
  minedAt: string;
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function runNudge(root: string): void {
  if (!existsSync(join(root, ".mm"))) return;

  const results = candidates(root, { minScore: DEFAULT_MIN_SCORE });
  if (results.length === 0) return;

  const ids = results.map((c) => deriveCandidateId(c)).sort();
  const path = join(root, ".mm", "review-pending.json");
  const previous = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as ReviewPending) : undefined;
  if (previous && arraysEqual(previous.ids, ids)) return;

  const record: ReviewPending = { ids, count: ids.length, minedAt: new Date().toISOString() };
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
}
