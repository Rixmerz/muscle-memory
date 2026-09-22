/**
 * Reads, merges, and writes `.claude/settings.json`'s `hooks.PostToolUse`
 * array. Every function here touches that one key and nothing else in the
 * file (design.md § Merging into .claude/settings.json).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { HookFragment } from "./guard.js";

interface HookEntryStep {
  type: "command";
  command: string;
  timeout: number;
}

interface HookEntry {
  matcher: string;
  hooks: HookEntryStep[];
}

export interface Settings {
  hooks?: {
    PostToolUse?: HookEntry[];
    [otherEvent: string]: HookEntry[] | undefined;
  };
  [key: string]: unknown;
}

/** `JSON.parse` if the file exists, else `{}`. */
export function readSettings(path: string): Settings {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as Settings;
}

/** `JSON.stringify(settings, null, 2) + "\n"`, the one writer every caller
 * (`mm install`, `mm uninstall`, the guard) shares so output stays
 * byte-identical regardless of who produced it. */
export function writeSettings(path: string, settings: Settings): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
}

function entryHasId(entry: HookEntry, id: string): boolean {
  return entry.hooks.some((step) => step.command.includes(id));
}

/**
 * Appends a `hooks.PostToolUse` entry pointing at the guard, wrapping
 * `fragment.command` with `id`. Returns `settings` unchanged if an entry for
 * `id` is already present (idempotent re-install).
 */
export function installEntry(settings: Settings, fragment: HookFragment, id: string): Settings {
  const existing = settings.hooks?.PostToolUse ?? [];
  if (existing.some((entry) => entryHasId(entry, id))) {
    return settings;
  }

  const entry: HookEntry = {
    matcher: fragment.matcher,
    hooks: [
      {
        type: "command",
        command: `node .mm/hooks/guard.mjs ${id} -- ${fragment.command}`,
        timeout: 5,
      },
    ],
  };

  return {
    ...settings,
    hooks: {
      ...settings.hooks,
      PostToolUse: [...existing, entry],
    },
  };
}

/**
 * Drops any `hooks.PostToolUse` entry whose command carries `id`. Drops the
 * `PostToolUse` key if it becomes empty, and `hooks` entirely if that leaves
 * it `{}`. Used by both `mm uninstall` and the guard's own self-demotion.
 */
export function removeEntry(settings: Settings, id: string): Settings {
  const existing = settings.hooks?.PostToolUse;
  if (!existing) return settings;

  const remaining = existing.filter((entry) => !entryHasId(entry, id));

  const otherHookEvents = Object.fromEntries(
    Object.entries(settings.hooks ?? {}).filter(([event]) => event !== "PostToolUse"),
  );
  const nextHooks: Settings["hooks"] =
    remaining.length > 0 ? { ...otherHookEvents, PostToolUse: remaining } : otherHookEvents;

  if (Object.keys(nextHooks).length === 0) {
    const rest = Object.fromEntries(Object.entries(settings).filter(([key]) => key !== "hooks"));
    return rest;
  }

  return { ...settings, hooks: nextHooks };
}
