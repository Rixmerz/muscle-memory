/**
 * Id derivation, the fixed `guard.mjs` source, and the guard's on-disk state
 * shape (design.md § Deriving the id, § The guard). `guard.mjs` is emitted
 * verbatim, never templated, so it is a source constant rather than
 * generated at install time.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

/** Produced by `mm build` (`@muscle-memory/builder`'s `HookFragment`),
 * consumed here as plain JSON — this package has no dependency on the
 * builder itself. */
export interface HookFragment {
  event: "PostToolUse";
  matcher: "Bash";
  command: string;
  sourceSignature: string;
}

export interface InstallRecord {
  id: string;
  sourceSignature: string;
  command: string;
  installedAt: string;
}

export interface GuardState {
  id: string;
  consecutiveFailures: number;
  lastExitCode: number | null;
  disabledAt: string | null;
}

const FAILURE_THRESHOLD = 3;

/** First 8 hex characters of the SHA-256 of `command`, same primitive
 * `@muscle-memory/core`'s `argHash` uses, at the length design.md specifies
 * for a hook id. */
function shortHash(command: string): string {
  return createHash("sha256").update(command).digest("hex").slice(0, 8);
}

/** `sourceSignature-shortHash(command)`: stable across re-installs of the
 * identical fragment, distinct across two commands sharing a mined
 * signature. */
export function deriveId(fragment: Pick<HookFragment, "sourceSignature" | "command">): string {
  return `${fragment.sourceSignature}-${shortHash(fragment.command)}`;
}

export function readGuardState(path: string): GuardState | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as GuardState;
}

export function writeGuardState(path: string, state: GuardState): void {
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}

/**
 * The next `GuardState` after a run exiting `exitCode`: a `0` resets the
 * streak, a non-zero exit increments it and flags demotion once the streak
 * reaches `FAILURE_THRESHOLD`.
 */
export function nextGuardState(
  id: string,
  previous: GuardState | undefined,
  exitCode: number,
): { state: GuardState; shouldDemote: boolean } {
  if (exitCode === 0) {
    return {
      state: { id, consecutiveFailures: 0, lastExitCode: 0, disabledAt: previous?.disabledAt ?? null },
      shouldDemote: false,
    };
  }

  const consecutiveFailures = (previous?.consecutiveFailures ?? 0) + 1;
  const shouldDemote = consecutiveFailures >= FAILURE_THRESHOLD;

  return {
    state: {
      id,
      consecutiveFailures,
      lastExitCode: exitCode,
      disabledAt: shouldDemote ? new Date().toISOString() : (previous?.disabledAt ?? null),
    },
    shouldDemote,
  };
}

/**
 * `.mm/hooks/guard.mjs`'s fixed source (design.md § The guard). Invoked as
 * `node .mm/hooks/guard.mjs <id> -- <real command...>`: runs the real
 * command with stdin/env passed through untouched, records the exit code in
 * `.mm/hooks/<id>.state.json`, and after 3 consecutive non-zero exits,
 * strips its own `hooks.PostToolUse` entry from `.claude/settings.json`
 * before exiting with the real command's own exit code.
 */
export const GUARD_SOURCE = `#!/usr/bin/env node
// Emitted once by \`mm install\` (@muscle-memory/installer) and never
// overwritten by a later install. See design.md § The guard.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FAILURE_THRESHOLD = 3;
const HERE = dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = join(HERE, "..", "..", ".claude", "settings.json");

function parseArgs(argv) {
  const sepIndex = argv.indexOf("--");
  if (sepIndex === -1) {
    throw new Error("usage: guard.mjs <id> -- <real command...>");
  }
  const id = argv[0];
  const command = argv.slice(sepIndex + 1);
  return { id, command };
}

function readState(path) {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeState(path, state) {
  writeFileSync(path, JSON.stringify(state, null, 2) + "\\n");
}

function readSettings(path) {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeSettings(path, settings) {
  writeFileSync(path, JSON.stringify(settings, null, 2) + "\\n");
}

function entryHasId(entry, id) {
  return entry.hooks.some((step) => step.command.includes(id));
}

function removeEntry(settings, id) {
  const existing = settings.hooks?.PostToolUse;
  if (!existing) return settings;

  const remaining = existing.filter((entry) => !entryHasId(entry, id));

  const otherHookEvents = Object.fromEntries(
    Object.entries(settings.hooks ?? {}).filter(([event]) => event !== "PostToolUse"),
  );
  const nextHooks = remaining.length > 0 ? { ...otherHookEvents, PostToolUse: remaining } : otherHookEvents;

  if (Object.keys(nextHooks).length === 0) {
    const rest = Object.fromEntries(Object.entries(settings).filter(([key]) => key !== "hooks"));
    return rest;
  }

  return { ...settings, hooks: nextHooks };
}

function main() {
  const { id, command } = parseArgs(process.argv.slice(2));
  const stateDir = join(HERE);
  mkdirSync(stateDir, { recursive: true });
  const statePath = join(stateDir, \`\${id}.state.json\`);

  const result = spawnSync(command.join(" "), { stdio: "inherit", shell: true });
  const exitCode = result.status ?? 1;

  const previous = readState(statePath);

  if (exitCode === 0) {
    writeState(statePath, { id, consecutiveFailures: 0, lastExitCode: 0, disabledAt: previous?.disabledAt ?? null });
    process.exit(0);
  }

  const consecutiveFailures = (previous?.consecutiveFailures ?? 0) + 1;
  const shouldDemote = consecutiveFailures >= FAILURE_THRESHOLD;

  writeState(statePath, {
    id,
    consecutiveFailures,
    lastExitCode: exitCode,
    disabledAt: shouldDemote ? new Date().toISOString() : (previous?.disabledAt ?? null),
  });

  if (shouldDemote) {
    const settings = readSettings(SETTINGS_PATH);
    writeSettings(SETTINGS_PATH, removeEntry(settings, id));
  }

  process.exit(exitCode);
}

main();
`;
