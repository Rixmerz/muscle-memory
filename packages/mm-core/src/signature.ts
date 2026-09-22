/**
 * Reduces a tool invocation to a stable, low-cardinality signature plus an
 * argument hash. Runs in a hook on the critical path of every tool call
 * (30ms p99 budget, mostly Node startup), so this file imports only
 * `node:crypto` and does no top-level work beyond compiling regexes.
 *
 * The character-set filter is applied last, as a hard filter over the
 * finished string, after the semantic scrubbing below. Scrubbing keeps the
 * signature meaningful; the filter guarantees a case the scrubbing missed
 * still cannot leak into the NDJSON file a subagent may later read.
 */

import { createHash } from "node:crypto";

/** Tool names this module knows how to discriminate. Everything else, and an
 * absent name, collapses to `"unknown:unknown"` per the spec. */
const KNOWN_TOOLS = new Set(["bash", "read", "edit", "write", "notebookedit"]);
const FILE_TOOLS = new Set(["read", "edit", "write", "notebookedit"]);

/** Hard filter applied last: nothing outside this set reaches the caller. */
const DISALLOWED_CHARS_RE = /[^a-z0-9:._-]/g;

/** A token starting with `-` is a flag; `--key=value` carries its own value. */
const FLAG_RE = /^-/;
/** A token containing a scheme separator is a URL, dropped outright. */
const URL_RE = /:\/\//;
/** Known secret-token prefixes. */
const TOKEN_PREFIX_RE = /^(sk-|ghp_|gho_)/;
/** 20+ hex characters, the shape of a hashed or hex-encoded secret. */
const HEX_TOKEN_RE = /^[0-9a-fA-F]{20,}$/;
/** 20+ base64 characters, the shape of an encoded token. */
const BASE64_TOKEN_RE = /^[A-Za-z0-9+/]{20,}={0,2}$/;

/**
 * File tools with no extension (or no path at all) get this fixed label
 * rather than, say, a hash of the basename: a constant keeps every
 * extension-less file in one low-cardinality bucket and contains no path
 * segment by construction.
 */
const NO_EXTENSION_DISCRIMINATOR = "noext";

function isTokenShaped(token: string): boolean {
  return (
    TOKEN_PREFIX_RE.test(token) || HEX_TOKEN_RE.test(token) || BASE64_TOKEN_RE.test(token)
  );
}

/** Splits a shell command into tokens, treating a single- or double-quoted
 * span (which may contain spaces) as one token. Good enough to locate flags
 * and their values; it does not need to be a full shell parser. */
function tokenizeCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: string | null = null;

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
  if (current) tokens.push(current);
  return tokens;
}

function extractString(input: unknown, key: string): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function extractFirstString(input: unknown, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = extractString(input, key);
    if (value !== undefined) return value;
  }
  return undefined;
}

/**
 * Drops every flag and its value (`--key=value` and `--key value` forms),
 * every token-shaped secret, and every URL, then joins the first two
 * remaining tokens with `-`.
 */
function bashDiscriminator(toolInput: unknown): string {
  const command = extractString(toolInput, "command");
  if (!command) return "unknown";

  const tokens = tokenizeCommand(command);
  const kept: string[] = [];

  for (let i = 0; i < tokens.length && kept.length < 2; i++) {
    const token = tokens[i] as string;
    if (FLAG_RE.test(token)) {
      if (!token.includes("=")) {
        const next = tokens[i + 1];
        if (next !== undefined && !FLAG_RE.test(next)) {
          i++; // consume the flag's value too
        }
      }
      continue;
    }
    if (URL_RE.test(token) || isTokenShaped(token)) continue;
    kept.push(token);
  }

  return kept.length > 0 ? kept.join("-") : "unknown";
}

const FILE_PATH_KEYS = ["file_path", "notebook_path", "path"] as const;

/** Lowercased extension, nothing else — never a path segment. */
function fileDiscriminator(toolInput: unknown): string {
  const path = extractFirstString(toolInput, FILE_PATH_KEYS);
  if (!path) return NO_EXTENSION_DISCRIMINATOR;

  const base = path.split(/[/\\]/).pop() ?? "";
  const dotIndex = base.lastIndexOf(".");
  // dotIndex <= 0 covers both "no dot" and a dotfile like ".bashrc", which
  // has no extension of its own.
  if (dotIndex <= 0) return NO_EXTENSION_DISCRIMINATOR;

  return base.slice(dotIndex + 1);
}

/**
 * Returns `<tool>:<discriminator>`, matching `/^[a-z0-9:._-]+$/`. An absent
 * or unrecognised `toolName` yields `"unknown:unknown"`.
 */
export function toolSignature(toolName: string | undefined, toolInput: unknown): string {
  const lowerName = toolName?.toLowerCase();
  if (!lowerName || !KNOWN_TOOLS.has(lowerName)) {
    return "unknown:unknown";
  }

  const discriminator = FILE_TOOLS.has(lowerName)
    ? fileDiscriminator(toolInput)
    : bashDiscriminator(toolInput);

  const raw = `${lowerName}:${discriminator}`.toLowerCase();
  const scrubbed = raw.replace(DISALLOWED_CHARS_RE, "");
  return scrubbed.length > 0 ? scrubbed : "unknown:unknown";
}

/** Recursively sorts object keys so structurally-equal inputs serialise
 * identically regardless of insertion order. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Returns the first 12 hex characters of the SHA-256 of a canonical JSON
 * serialisation of `toolInput`, with object keys sorted recursively. A
 * non-serialisable input (a circular reference, a `BigInt`) still returns a
 * 12-character string rather than throwing.
 */
export function argHash(toolInput: unknown): string {
  let json: string;
  try {
    json = JSON.stringify(canonicalize(toolInput)) ?? "null";
  } catch {
    json = "unserializable";
  }
  return createHash("sha256").update(json).digest("hex").slice(0, 12);
}
