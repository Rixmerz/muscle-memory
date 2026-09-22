#!/usr/bin/env node
/**
 * `mm-install install <fragment-file> [--settings <path>]` and
 * `mm-install uninstall <id> [--settings <path>]` — merges an `mm build`
 * hook fragment into `.claude/settings.json` behind the guard, or removes an
 * installed hook's entry and records (design.md § CLI).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deriveId, GUARD_SOURCE, type HookFragment, type InstallRecord } from "./guard.js";
import { installEntry, readSettings, removeEntry, writeSettings } from "./settings.js";

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseFlags(argv: readonly string[]): { positional: string[]; settings: string | undefined } {
  const positional: string[] = [];
  let settings: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--settings") {
      settings = argv[i + 1];
      i++;
    } else {
      positional.push(arg as string);
    }
  }

  return { positional, settings };
}

function settingsPath(override: string | undefined): string {
  return override ?? join(process.cwd(), ".claude", "settings.json");
}

/** Validates the parsed JSON matches `HookFragment`'s shape. Only
 * `event: "PostToolUse"` / `matcher: "Bash"` fragments are supported — that
 * is the only shape `mm build` (M4) can produce (design.md § Out of scope). */
function parseFragment(raw: unknown): HookFragment {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("fragment is not a JSON object");
  }
  const obj = raw as Record<string, unknown>;

  if (obj.event !== "PostToolUse") {
    throw new Error(`unsupported fragment event: expected "PostToolUse", got ${JSON.stringify(obj.event)}`);
  }
  if (obj.matcher !== "Bash") {
    throw new Error(`unsupported fragment matcher: expected "Bash", got ${JSON.stringify(obj.matcher)}`);
  }
  if (typeof obj.command !== "string" || obj.command.length === 0) {
    throw new Error("fragment is missing a non-empty `command` field");
  }
  if (typeof obj.sourceSignature !== "string" || obj.sourceSignature.length === 0) {
    throw new Error("fragment is missing a non-empty `sourceSignature` field");
  }

  return {
    event: "PostToolUse",
    matcher: "Bash",
    command: obj.command,
    sourceSignature: obj.sourceSignature,
  };
}

function install(file: string | undefined, settingsOverride: string | undefined): void {
  if (!file) {
    fail("a fragment file is required: mm-install install <fragment-file>");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    fail(`${file}: could not be read as JSON (${(err as Error).message})`);
  }

  let fragment: HookFragment;
  try {
    fragment = parseFragment(raw);
  } catch (err) {
    fail((err as Error).message);
  }

  const id = deriveId(fragment);
  const root = process.cwd();
  const hooksDir = join(root, ".mm", "hooks");
  const guardPath = join(hooksDir, "guard.mjs");

  mkdirSync(hooksDir, { recursive: true });
  if (!existsSync(guardPath)) {
    writeFileSync(guardPath, GUARD_SOURCE);
  }

  const path = settingsPath(settingsOverride);
  const settings = readSettings(path);
  writeSettings(path, installEntry(settings, fragment, id));

  const record: InstallRecord = {
    id,
    sourceSignature: fragment.sourceSignature,
    command: fragment.command,
    installedAt: new Date().toISOString(),
  };
  writeFileSync(join(hooksDir, `${id}.install.json`), `${JSON.stringify(record, null, 2)}\n`);

  process.stdout.write(`${id}\n`);
  process.exit(0);
}

function uninstall(id: string | undefined, settingsOverride: string | undefined): void {
  if (!id) {
    fail("an id is required: mm-install uninstall <id>");
  }

  const path = settingsPath(settingsOverride);
  const settings = readSettings(path);
  writeSettings(path, removeEntry(settings, id));

  const hooksDir = join(process.cwd(), ".mm", "hooks");
  for (const suffix of ["install.json", "state.json"]) {
    const recordPath = join(hooksDir, `${id}.${suffix}`);
    rmSync(recordPath, { force: true });
  }

  process.exit(0);
}

function main(): void {
  const [subcommand, ...rest] = process.argv.slice(2);
  const { positional, settings } = parseFlags(rest);

  if (subcommand === "install") {
    install(positional[0], settings);
  } else if (subcommand === "uninstall") {
    uninstall(positional[0], settings);
  } else {
    fail("usage: mm-install install <fragment-file> | mm-install uninstall <id>");
  }
}

main();
