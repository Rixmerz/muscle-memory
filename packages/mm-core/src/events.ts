/**
 * The shapes on both sides of the logger: what Claude Code hands a hook on
 * stdin, and what muscle-memory writes to disk.
 *
 * `MMEvent` is a file format before it is a type. It is appended to an NDJSON
 * file that a later milestone's aggregator reads back, so a field added here
 * without bumping `EVENT_SCHEMA_VERSION` silently changes the meaning of every
 * record already on disk.
 */

/** Bumped whenever `MMEvent` changes shape. Written to every record as `v`. */
export const EVENT_SCHEMA_VERSION = 1;

/**
 * The hook events muscle-memory records. Others are read and ignored.
 *
 * The array is the declaration and the type is derived from it, rather than
 * the other way round, because the plugin's `hooks/hooks.json` registers these
 * names as strings and a test checks the two lists against each other. A union
 * type alone is erased at build time and cannot be checked against a file.
 */
export const HOOK_EVENT_NAMES = [
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "UserPromptSubmit",
  "SessionStart",
  "SessionEnd",
  "Stop",
] as const;

export type HookEventName = (typeof HOOK_EVENT_NAMES)[number];

/**
 * What Claude Code writes to a hook's stdin. Every field is optional on
 * purpose: this is untrusted input from another process, and the logger's
 * contract is to record something rather than to reject a payload it did not
 * expect.
 */
export interface HookPayload {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: unknown;
}

/** One line of `.mm/events/<YYYY-MM-DD>.ndjson`. */
export interface MMEvent {
  /** Schema version. Always `EVENT_SCHEMA_VERSION` on write. */
  v: number;
  /** ISO-8601 UTC with milliseconds. */
  ts: string;
  /** Claude Code's session id, or `"unknown"` when the payload omitted it. */
  session: string;
  /** Working directory the tool ran in, or `"unknown"`. */
  cwd: string;
  /** The hook that fired. */
  event: HookEventName | "unknown";
  /** Tool name as Claude Code reported it, or `"unknown"`. */
  tool: string;
  /** Normalised signature. Never contains a path, a URL, or a secret. */
  sig: string;
  /** First 12 hex of the SHA-256 of the canonicalised tool input. */
  arg: string;
  /** Present on PostToolUse only: did the tool call succeed. */
  ok?: boolean;
  /** Present on PostToolUse only: tool wall time in milliseconds. */
  dur_ms?: number;
  /** Set when the record was shortened to stay within the atomic-write bound. */
  trunc?: true;
}

/** `"unknown"` is used rather than dropping a record we could not fully parse. */
export const UNKNOWN = "unknown";
