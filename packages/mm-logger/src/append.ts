/**
 * Appends one record to its UTC day file. `O_APPEND` writes below `PIPE_BUF`
 * (4096 bytes on both macOS and Linux) are atomic, so concurrent hook
 * processes writing the same file cannot interleave lines (design.md). That
 * guarantee only holds under the bound: a record whose serialisation would
 * exceed it is truncated to the fields the aggregator actually needs before
 * it is ever written, rather than letting the atomicity guarantee quietly
 * stop holding at a size nobody tests.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { eventFileFor, type MMEvent } from "@muscle-memory/core";

/** Below `PIPE_BUF` (4096) with margin for the newline and JSON punctuation. */
const MAX_RECORD_BYTES = 4000;

function truncated(record: MMEvent): MMEvent {
  return {
    v: record.v,
    ts: record.ts,
    session: record.session,
    cwd: record.cwd,
    event: record.event,
    tool: record.tool,
    sig: record.sig,
    arg: record.arg,
    trunc: true,
  };
}

/**
 * Serialises `record` and appends it to the day file for its `ts`, under
 * `root`. Creates the parent directory if absent. Throws on any I/O failure —
 * callers on the 30ms hot path (bin.ts) are responsible for swallowing that,
 * per the "failure is silence" contract; this function is not.
 */
export function appendRecord(record: MMEvent, root: string): void {
  let line = JSON.stringify(record);
  if (Buffer.byteLength(line, "utf8") > MAX_RECORD_BYTES) {
    line = JSON.stringify(truncated(record));
  }

  const path = eventFileFor(new Date(record.ts), root);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${line}\n`, { flag: "a" });
}
