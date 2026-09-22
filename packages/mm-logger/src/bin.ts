#!/usr/bin/env node
/**
 * Spawned once per tool call, inside Claude Code's `PreToolUse`/`PostToolUse`
 * hook chain. ~30ms budget, mostly Node's own startup (design.md) — Node
 * builtins and `@muscle-memory/core`'s pure functions only, no dependencies,
 * no async: a process that writes one line and exits does not need an
 * event-loop turn to buy concurrency.
 *
 * `main()`'s entire body sits inside one try/catch whose handler exits 0.
 * Every path exits 0 — malformed stdin, empty stdin, an unwritable
 * directory, a full disk — because a logger that breaks a tool call is worse
 * than a logger that loses an event, and the data is for a pattern miner
 * that needs hundreds of samples, not one. Nothing is ever written to
 * stdout, so a hook consumer parsing stdout is never handed a diagnostic by
 * mistake.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EVENT_SCHEMA_VERSION,
  HOOK_EVENT_NAMES,
  MM_DIR,
  UNKNOWN,
  argHash,
  toolSignature,
  type HookEventName,
  type HookPayload,
  type MMEvent,
} from "@muscle-memory/core";
import { appendRecord } from "./append.js";
import { runBackfillCli } from "./backfill.js";

const KNOWN_EVENTS: ReadonlySet<string> = new Set(HOOK_EVENT_NAMES);

function eventNameOf(payload: HookPayload): HookEventName | "unknown" {
  const name = payload.hook_event_name;
  return typeof name === "string" && KNOWN_EVENTS.has(name)
    ? (name as HookEventName)
    : UNKNOWN;
}

/** `tool_response` is whatever the tool returned; both derived fields are best-effort. */
function outcomeOf(toolResponse: unknown): { ok: boolean; dur_ms: number } {
  const r = typeof toolResponse === "object" && toolResponse !== null
    ? (toolResponse as Record<string, unknown>)
    : {};
  const ok = r["success"] !== false && r["isError"] !== true && r["error"] === undefined;
  const rawDur = r["durationMs"] ?? r["duration_ms"];
  const dur_ms = typeof rawDur === "number" && Number.isFinite(rawDur) ? rawDur : 0;
  return { ok, dur_ms };
}

function main(): void {
  try {
    const payload = JSON.parse(readFileSync(0, "utf8")) as HookPayload;
    const event = eventNameOf(payload);

    const record: MMEvent = {
      v: EVENT_SCHEMA_VERSION,
      ts: new Date().toISOString(),
      session: payload.session_id ?? UNKNOWN,
      cwd: payload.cwd ?? UNKNOWN,
      event,
      tool: payload.tool_name ?? UNKNOWN,
      sig: toolSignature(payload.tool_name, payload.tool_input),
      arg: argHash(payload.tool_input),
    };

    if (event === "PostToolUse") {
      const outcome = outcomeOf(payload.tool_response);
      record.ok = outcome.ok;
      record.dur_ms = outcome.dur_ms;
    }

    appendRecord(record, process.cwd());
  } catch {
    // Silence, always — see the file header.
  }
  process.exit(0);
}

/**
 * The consent gate, and it runs before anything else — before stdin is read,
 * before argv is dispatched. The plugin registers `PreToolUse` on `*`, so this
 * binary is spawned in every repository the person works in; `.mm/` is what
 * distinguishes the ones that asked to be recorded. No `.mm/` directory, no
 * read, no write, no output, exit 0.
 *
 * Directory presence rather than a config key, so consent and the data it
 * consents to cannot drift apart: the gate is the same directory the records
 * land in, and `rm -rf .mm` revokes both at once. It is never created here —
 * only by `/mm:enable`.
 *
 * `process.cwd()` and not the payload's `cwd`: the gate has to be checkable
 * before the payload exists, and a root taken from untrusted stdin could point
 * the writer at a directory nobody opted in.
 */
if (!existsSync(join(process.cwd(), MM_DIR))) {
  process.exit(0);
}

if (process.argv[2] === "backfill") {
  runBackfillCli(process.argv.slice(3));
} else {
  main();
}
