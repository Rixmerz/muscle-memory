/**
 * Groups the flat event stream into per-session, `ts`-ordered sequences, and
 * mines contiguous `sig` n-grams out of each one. A window never crosses a
 * session boundary because it is built by sliding over one session's own
 * `PreToolUse` events, never across sessions (spec.md).
 */
import type { MMEvent } from "@muscle-memory/core";

export interface Occurrence {
  session: string;
  /** `ts` of the pattern's first step. */
  startTs: string;
  /** `arg` of the pattern's first step. */
  argHash: string;
  /** Per-step outcome; `true` when the step has no matching `PostToolUse`. */
  stepsOk: boolean[];
}

export interface Pattern {
  /** The `sig` sequence, length 2-4. */
  steps: string[];
  occurrences: Occurrence[];
}

export interface MineOptions {
  minLen: number;
  maxLen: number;
}

/** Groups events by `session`, each session's events ordered by `ts` ascending. */
export function groupSessions(events: readonly MMEvent[]): Map<string, MMEvent[]> {
  const sessions = new Map<string, MMEvent[]>();
  for (const event of events) {
    const bucket = sessions.get(event.session);
    if (bucket) {
      bucket.push(event);
    } else {
      sessions.set(event.session, [event]);
    }
  }
  for (const bucket of sessions.values()) {
    bucket.sort((a, b) => a.ts.localeCompare(b.ts));
  }
  return sessions;
}

/**
 * The outcome of the `PreToolUse` at `preIndex`: the `ok` field of the next
 * `PostToolUse` in the same session's stream with the same `sig`, matched by
 * adjacency (design.md) since `MMEvent` carries no `tool_use_id`. A step
 * with no matching `PostToolUse` counts as successful.
 */
function stepOk(sessionEvents: readonly MMEvent[], preIndex: number): boolean {
  const sig = sessionEvents[preIndex]!.sig;
  for (let j = preIndex + 1; j < sessionEvents.length; j++) {
    const event = sessionEvents[j]!;
    if (event.event === "PostToolUse" && event.sig === sig) {
      return event.ok ?? true;
    }
  }
  return true;
}

/**
 * Slides windows of length `minLen` to `maxLen` over each session's ordered
 * `PreToolUse` signatures, and groups the resulting windows by their `steps`
 * sequence into one `Pattern` per distinct sequence across the corpus.
 */
export function mineNgrams(
  sessions: ReadonlyMap<string, readonly MMEvent[]>,
  { minLen, maxLen }: MineOptions,
): Pattern[] {
  const patterns = new Map<string, Pattern>();

  for (const [session, events] of sessions) {
    const preIndices: number[] = [];
    for (let i = 0; i < events.length; i++) {
      if (events[i]!.event === "PreToolUse") preIndices.push(i);
    }

    for (let start = 0; start + minLen <= preIndices.length; start++) {
      for (let len = minLen; len <= maxLen && start + len <= preIndices.length; len++) {
        const windowIndices = preIndices.slice(start, start + len);
        const steps = windowIndices.map((i) => events[i]!.sig);
        const key = steps.join("\u0000");

        const first = events[windowIndices[0]!]!;
        const occurrence: Occurrence = {
          session,
          startTs: first.ts,
          argHash: first.arg,
          stepsOk: windowIndices.map((i) => stepOk(events, i)),
        };

        const existing = patterns.get(key);
        if (existing) {
          existing.occurrences.push(occurrence);
        } else {
          patterns.set(key, { steps, occurrences: [occurrence] });
        }
      }
    }
  }

  return [...patterns.values()];
}
