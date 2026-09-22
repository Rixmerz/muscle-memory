/**
 * Replays Claude Code transcripts under `~/.claude/projects/<slug>/*.jsonl`
 * into the same NDJSON format the hook writes, so the aggregator has history
 * from day one instead of in two weeks (proposal.md).
 *
 * A transcript entry is Claude Code's conversation format: an assistant
 * message's content carries `tool_use` blocks, and the following user
 * message carries the paired `tool_result`. Both map to an `MMEvent` the way
 * the hook would have recorded them, keyed on the entry's own `timestamp` so
 * the *original* event date decides the day file, never the date backfill
 * runs (design.md).
 *
 * Idempotence comes from rewriting each affected day file from scratch, under
 * a temp name, then renaming over the original: a second run over the same
 * transcripts recomputes the same records and overwrites, instead of
 * appending duplicates on top of the first run.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  EVENT_SCHEMA_VERSION,
  UNKNOWN,
  argHash,
  eventFileFor,
  eventsDir,
  toolSignature,
  utcDay,
  type MMEvent,
} from "@muscle-memory/core";

interface ContentBlock {
  type?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  is_error?: boolean;
}

interface TranscriptEntry {
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  message?: { content?: ContentBlock[] | string };
}

/** `~/.claude/projects/<slug>` for `root`: the absolute path with every `/` replaced by `-`. */
export function projectSlug(root: string): string {
  return root.replace(/\//g, "-");
}

/** The transcript directory for `root`, under `claudeHome` (defaults to `~/.claude`). */
export function transcriptDir(root: string, claudeHome: string = join(homedir(), ".claude")): string {
  return join(claudeHome, "projects", projectSlug(root));
}

function buildRecord(
  ts: string,
  session: string,
  cwd: string,
  event: "PreToolUse" | "PostToolUse",
  toolName: string | undefined,
  toolInput: unknown,
  outcome?: { ok: boolean; dur_ms: number },
): MMEvent {
  const record: MMEvent = {
    v: EVENT_SCHEMA_VERSION,
    ts,
    session: session || UNKNOWN,
    cwd: cwd || UNKNOWN,
    event,
    tool: toolName ?? UNKNOWN,
    sig: toolSignature(toolName, toolInput),
    arg: argHash(toolInput),
  };
  if (outcome) {
    record.ok = outcome.ok;
    record.dur_ms = outcome.dur_ms;
  }
  return record;
}

/** Parses one transcript file into `MMEvent`s, skipping any line that is not valid JSON. */
function parseTranscript(path: string): MMEvent[] {
  const lines = readFileSync(path, "utf8").split("\n");
  const pending = new Map<string, { name: string | undefined; input: unknown; ts: string }>();
  const records: MMEvent[] = [];

  for (const line of lines) {
    if (line.trim() === "") continue;

    let entry: TranscriptEntry;
    try {
      entry = JSON.parse(line) as TranscriptEntry;
    } catch {
      continue;
    }

    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;

    const ts = entry.timestamp ?? new Date().toISOString();
    const session = entry.sessionId ?? UNKNOWN;
    const cwd = entry.cwd ?? UNKNOWN;

    for (const block of content) {
      if (block.type === "tool_use" && typeof block.id === "string") {
        pending.set(block.id, { name: block.name, input: block.input, ts });
        records.push(buildRecord(ts, session, cwd, "PreToolUse", block.name, block.input));
      } else if (block.type === "tool_result" && typeof block.tool_use_id === "string") {
        const use = pending.get(block.tool_use_id);
        const dur_ms = use ? Math.max(0, new Date(ts).getTime() - new Date(use.ts).getTime()) : 0;
        records.push(
          buildRecord(ts, session, cwd, "PostToolUse", use?.name, use?.input, {
            ok: block.is_error !== true,
            dur_ms,
          }),
        );
      }
    }
  }

  return records;
}

/**
 * Runs backfill for `root` against transcripts under `claudeHome`. Returns
 * the number of day files written. A no-op (returns 0) when no transcript
 * directory exists for `root`.
 */
export function runBackfill(root: string, claudeHome: string = join(homedir(), ".claude")): number {
  const dir = transcriptDir(root, claudeHome);
  if (!existsSync(dir)) return 0;

  const byDate = new Map<string, MMEvent[]>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".jsonl"))) {
    for (const record of parseTranscript(join(dir, file))) {
      const day = utcDay(new Date(record.ts));
      const bucket = byDate.get(day) ?? [];
      bucket.push(record);
      byDate.set(day, bucket);
    }
  }

  mkdirSync(eventsDir(root), { recursive: true });
  for (const [day, records] of byDate) {
    const path = eventFileFor(new Date(`${day}T00:00:00.000Z`), root);
    const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
    const body = `${records.map((r) => JSON.stringify(r)).join("\n")}\n`;
    writeFileSync(tmp, body);
    renameSync(tmp, path);
  }

  return byDate.size;
}

/** CLI entry for `mm-log backfill [root]`. Reports to stderr; exits non-zero on failure. */
export function runBackfillCli(args: readonly string[]): void {
  const root = args[0] ?? process.cwd();
  try {
    const written = runBackfill(root);
    process.stderr.write(`mm-log backfill: wrote ${written} day file(s) for ${root}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`mm-log backfill: failed — ${message}\n`);
    process.exitCode = 1;
  }
}
