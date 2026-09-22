/**
 * A stable id for a mined candidate, derived from its steps and occurrence
 * count only — pure, no scoring or filtering (design.md § mm-nudge.mjs).
 */
import { createHash } from "node:crypto";
import type { Pattern } from "./sequences.js";

export function deriveCandidateId(pattern: Pick<Pattern, "steps" | "occurrences">): string {
  const key = `${pattern.steps.join("\u0000")}\u0000${pattern.occurrences.length}`;
  return createHash("sha256").update(key).digest("hex").slice(0, 12);
}
