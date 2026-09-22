/**
 * Where events land. UTC throughout: a day file that means "today" in the
 * writer's local zone would put two machines' records for the same instant in
 * different files, and the aggregator has no way to tell.
 */

import { join } from "node:path";

/** The per-repo muscle-memory directory. Gitignored; never committed. */
export const MM_DIR = ".mm";

/** `YYYY-MM-DD` in UTC for the given instant. */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** Absolute path of the NDJSON day file an event at `at` belongs in. */
export function eventFileFor(at: Date, root: string): string {
  return join(root, MM_DIR, "events", `${utcDay(at)}.ndjson`);
}

/** Absolute path of the events directory under `root`. */
export function eventsDir(root: string): string {
  return join(root, MM_DIR, "events");
}
