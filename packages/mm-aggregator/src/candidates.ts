/**
 * The read-only pipeline: read every day file, group into sessions, mine
 * n-grams, score against the corpus, keep what clears the threshold, and
 * sort by score descending. Nothing here writes to disk (spec.md).
 */
import { readEvents } from "./ndjson.js";
import { groupSessions, mineNgrams, type Pattern } from "./sequences.js";
import { score } from "./score.js";

export interface ScoredPattern extends Pattern {
  score: number;
  /** Distinct session count the pattern was observed in. */
  sessions: number;
}

export interface CandidatesOptions {
  minScore: number;
}

const WINDOW = { minLen: 2, maxLen: 4 } as const;

export function candidates(root: string, { minScore }: CandidatesOptions): ScoredPattern[] {
  const events = readEvents(root);
  if (events.length === 0) return [];

  const sessions = groupSessions(events);
  const patterns = mineNgrams(sessions, WINDOW);

  const corpus = {
    totalSessions: sessions.size,
    totalDays: new Set(events.map((e) => e.ts.slice(0, 10))).size,
  };

  return patterns
    .map((pattern) => ({
      ...pattern,
      score: score(pattern, corpus),
      sessions: new Set(pattern.occurrences.map((o) => o.session)).size,
    }))
    .filter((candidate) => candidate.score >= minScore)
    .sort((a, b) => b.score - a.score);
}
