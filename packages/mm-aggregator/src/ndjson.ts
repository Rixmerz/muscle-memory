/**
 * Reads back the day files `@muscle-memory/logger` writes. The format is
 * ours end to end, but a line can still be truncated by a crash mid-write or
 * hand-edited, so a malformed line is skipped rather than treated as fatal
 * (spec.md) — one bad line should not cost the whole corpus.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { eventsDir, type MMEvent } from "@muscle-memory/core";

function isMMEvent(value: unknown): value is MMEvent {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record["ts"] === "string" &&
    typeof record["session"] === "string" &&
    typeof record["event"] === "string" &&
    typeof record["sig"] === "string" &&
    typeof record["arg"] === "string"
  );
}

/**
 * Reads every `.mm/events/*.ndjson` day file under `root`. Returns `[]` when
 * `.mm/events/` does not exist. Malformed lines are skipped, not fatal.
 */
export function readEvents(root: string): MMEvent[] {
  const dir = eventsDir(root);
  if (!existsSync(dir)) return [];

  const events: MMEvent[] = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".ndjson"))) {
    const lines = readFileSync(join(dir, file), "utf8").split("\n");
    for (const line of lines) {
      if (line.trim() === "") continue;
      try {
        const parsed: unknown = JSON.parse(line);
        if (isMMEvent(parsed)) events.push(parsed);
      } catch {
        // Malformed line: skipped, per spec.
      }
    }
  }
  return events;
}
