#!/usr/bin/env node

// packages/mm-logger/dist/bin.js
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { join as join3 } from "node:path";

// packages/mm-core/dist/events.js
var EVENT_SCHEMA_VERSION = 1;
var HOOK_EVENT_NAMES = [
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "UserPromptSubmit",
  "SessionStart",
  "SessionEnd",
  "Stop"
];
var UNKNOWN = "unknown";

// packages/mm-core/dist/paths.js
import { join } from "node:path";
var MM_DIR = ".mm";
function utcDay(at) {
  return at.toISOString().slice(0, 10);
}
function eventFileFor(at, root) {
  return join(root, MM_DIR, "events", `${utcDay(at)}.ndjson`);
}
function eventsDir(root) {
  return join(root, MM_DIR, "events");
}

// packages/mm-core/dist/signature.js
import { createHash } from "node:crypto";
var KNOWN_TOOLS = /* @__PURE__ */ new Set(["bash", "read", "edit", "write", "notebookedit"]);
var FILE_TOOLS = /* @__PURE__ */ new Set(["read", "edit", "write", "notebookedit"]);
var DISALLOWED_CHARS_RE = /[^a-z0-9:._-]/g;
var FLAG_RE = /^-/;
var URL_RE = /:\/\//;
var TOKEN_PREFIX_RE = /^(sk-|ghp_|gho_)/;
var HEX_TOKEN_RE = /^[0-9a-fA-F]{20,}$/;
var BASE64_TOKEN_RE = /^[A-Za-z0-9+/]{20,}={0,2}$/;
var NO_EXTENSION_DISCRIMINATOR = "noext";
function isTokenShaped(token) {
  return TOKEN_PREFIX_RE.test(token) || HEX_TOKEN_RE.test(token) || BASE64_TOKEN_RE.test(token);
}
function tokenizeCommand(command) {
  const tokens = [];
  let current = "";
  let quote = null;
  for (const char of command) {
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current)
    tokens.push(current);
  return tokens;
}
function extractString(input, key) {
  if (typeof input !== "object" || input === null)
    return void 0;
  const value = input[key];
  return typeof value === "string" ? value : void 0;
}
function extractFirstString(input, keys) {
  for (const key of keys) {
    const value = extractString(input, key);
    if (value !== void 0)
      return value;
  }
  return void 0;
}
function bashDiscriminator(toolInput) {
  const command = extractString(toolInput, "command");
  if (!command)
    return "unknown";
  const tokens = tokenizeCommand(command);
  const kept = [];
  for (let i = 0; i < tokens.length && kept.length < 2; i++) {
    const token = tokens[i];
    if (FLAG_RE.test(token)) {
      if (!token.includes("=")) {
        const next = tokens[i + 1];
        if (next !== void 0 && !FLAG_RE.test(next)) {
          i++;
        }
      }
      continue;
    }
    if (URL_RE.test(token) || isTokenShaped(token))
      continue;
    kept.push(token);
  }
  return kept.length > 0 ? kept.join("-") : "unknown";
}
var FILE_PATH_KEYS = ["file_path", "notebook_path", "path"];
function fileDiscriminator(toolInput) {
  const path = extractFirstString(toolInput, FILE_PATH_KEYS);
  if (!path)
    return NO_EXTENSION_DISCRIMINATOR;
  const base = path.split(/[/\\]/).pop() ?? "";
  const dotIndex = base.lastIndexOf(".");
  if (dotIndex <= 0)
    return NO_EXTENSION_DISCRIMINATOR;
  return base.slice(dotIndex + 1);
}
function toolSignature(toolName, toolInput) {
  const lowerName = toolName?.toLowerCase();
  if (!lowerName || !KNOWN_TOOLS.has(lowerName)) {
    return "unknown:unknown";
  }
  const discriminator = FILE_TOOLS.has(lowerName) ? fileDiscriminator(toolInput) : bashDiscriminator(toolInput);
  const raw = `${lowerName}:${discriminator}`.toLowerCase();
  const scrubbed = raw.replace(DISALLOWED_CHARS_RE, "");
  return scrubbed.length > 0 ? scrubbed : "unknown:unknown";
}
function canonicalize(value) {
  if (Array.isArray(value))
    return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = canonicalize(value[key]);
    }
    return sorted;
  }
  return value;
}
function argHash(toolInput) {
  let json;
  try {
    json = JSON.stringify(canonicalize(toolInput)) ?? "null";
  } catch {
    json = "unserializable";
  }
  return createHash("sha256").update(json).digest("hex").slice(0, 12);
}

// packages/mm-logger/dist/append.js
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
var MAX_RECORD_BYTES = 4e3;
function truncated(record) {
  return {
    v: record.v,
    ts: record.ts,
    session: record.session,
    cwd: record.cwd,
    event: record.event,
    tool: record.tool,
    sig: record.sig,
    arg: record.arg,
    trunc: true
  };
}
function appendRecord(record, root) {
  let line = JSON.stringify(record);
  if (Buffer.byteLength(line, "utf8") > MAX_RECORD_BYTES) {
    line = JSON.stringify(truncated(record));
  }
  const path = eventFileFor(new Date(record.ts), root);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${line}
`, { flag: "a" });
}

// packages/mm-logger/dist/backfill.js
import { existsSync, mkdirSync as mkdirSync2, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join as join2 } from "node:path";
function projectSlug(root) {
  return root.replace(/\//g, "-");
}
function transcriptDir(root, claudeHome = join2(homedir(), ".claude")) {
  return join2(claudeHome, "projects", projectSlug(root));
}
function buildRecord(ts, session, cwd, event, toolName, toolInput, outcome) {
  const record = {
    v: EVENT_SCHEMA_VERSION,
    ts,
    session: session || UNKNOWN,
    cwd: cwd || UNKNOWN,
    event,
    tool: toolName ?? UNKNOWN,
    sig: toolSignature(toolName, toolInput),
    arg: argHash(toolInput)
  };
  if (outcome) {
    record.ok = outcome.ok;
    record.dur_ms = outcome.dur_ms;
  }
  return record;
}
function parseTranscript(path) {
  const lines = readFileSync(path, "utf8").split("\n");
  const pending = /* @__PURE__ */ new Map();
  const records = [];
  for (const line of lines) {
    if (line.trim() === "")
      continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const content = entry.message?.content;
    if (!Array.isArray(content))
      continue;
    const ts = entry.timestamp ?? (/* @__PURE__ */ new Date()).toISOString();
    const session = entry.sessionId ?? UNKNOWN;
    const cwd = entry.cwd ?? UNKNOWN;
    for (const block of content) {
      if (block.type === "tool_use" && typeof block.id === "string") {
        pending.set(block.id, { name: block.name, input: block.input, ts });
        records.push(buildRecord(ts, session, cwd, "PreToolUse", block.name, block.input));
      } else if (block.type === "tool_result" && typeof block.tool_use_id === "string") {
        const use = pending.get(block.tool_use_id);
        const dur_ms = use ? Math.max(0, new Date(ts).getTime() - new Date(use.ts).getTime()) : 0;
        records.push(buildRecord(ts, session, cwd, "PostToolUse", use?.name, use?.input, {
          ok: block.is_error !== true,
          dur_ms
        }));
      }
    }
  }
  return records;
}
function runBackfill(root, claudeHome = join2(homedir(), ".claude")) {
  const dir = transcriptDir(root, claudeHome);
  if (!existsSync(dir))
    return 0;
  const byDate = /* @__PURE__ */ new Map();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".jsonl"))) {
    for (const record of parseTranscript(join2(dir, file))) {
      const day = utcDay(new Date(record.ts));
      const bucket = byDate.get(day) ?? [];
      bucket.push(record);
      byDate.set(day, bucket);
    }
  }
  mkdirSync2(eventsDir(root), { recursive: true });
  for (const [day, records] of byDate) {
    const path = eventFileFor(/* @__PURE__ */ new Date(`${day}T00:00:00.000Z`), root);
    const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
    const body = `${records.map((r) => JSON.stringify(r)).join("\n")}
`;
    writeFileSync(tmp, body);
    renameSync(tmp, path);
  }
  return byDate.size;
}
function runBackfillCli(args) {
  const root = args[0] ?? process.cwd();
  try {
    const written = runBackfill(root);
    process.stderr.write(`mm-log backfill: wrote ${written} day file(s) for ${root}
`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`mm-log backfill: failed \u2014 ${message}
`);
    process.exitCode = 1;
  }
}

// packages/mm-logger/dist/bin.js
var KNOWN_EVENTS = new Set(HOOK_EVENT_NAMES);
function eventNameOf(payload) {
  const name = payload.hook_event_name;
  return typeof name === "string" && KNOWN_EVENTS.has(name) ? name : UNKNOWN;
}
function outcomeOf(toolResponse) {
  const r = typeof toolResponse === "object" && toolResponse !== null ? toolResponse : {};
  const ok = r["success"] !== false && r["isError"] !== true && r["error"] === void 0;
  const rawDur = r["durationMs"] ?? r["duration_ms"];
  const dur_ms = typeof rawDur === "number" && Number.isFinite(rawDur) ? rawDur : 0;
  return { ok, dur_ms };
}
function main() {
  try {
    const payload = JSON.parse(readFileSync2(0, "utf8"));
    const event = eventNameOf(payload);
    const record = {
      v: EVENT_SCHEMA_VERSION,
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      session: payload.session_id ?? UNKNOWN,
      cwd: payload.cwd ?? UNKNOWN,
      event,
      tool: payload.tool_name ?? UNKNOWN,
      sig: toolSignature(payload.tool_name, payload.tool_input),
      arg: argHash(payload.tool_input)
    };
    if (event === "PostToolUse") {
      const outcome = outcomeOf(payload.tool_response);
      record.ok = outcome.ok;
      record.dur_ms = outcome.dur_ms;
    }
    appendRecord(record, process.cwd());
  } catch {
  }
  process.exit(0);
}
if (!existsSync2(join3(process.cwd(), MM_DIR))) {
  process.exit(0);
}
if (process.argv[2] === "backfill") {
  runBackfillCli(process.argv.slice(3));
} else {
  main();
}
