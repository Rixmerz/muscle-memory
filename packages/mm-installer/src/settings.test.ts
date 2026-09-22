import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HookFragment } from "./guard.js";
import { installEntry, readSettings, removeEntry, writeSettings } from "./settings.js";

const FRAGMENT: HookFragment = {
  event: "PostToolUse",
  matcher: "Bash",
  command: "pnpm test",
  sourceSignature: "bash:pnpm-test",
};

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "mm-installer-settings-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("readSettings", () => {
  it("returns {} when the file does not exist", () => {
    expect(readSettings(join(root, "settings.json"))).toEqual({});
  });

  it("parses an existing file", () => {
    const path = join(root, "settings.json");
    writeFileSync(path, JSON.stringify({ env: { FOO: "bar" } }));
    expect(readSettings(path)).toEqual({ env: { FOO: "bar" } });
  });
});

describe("installEntry", () => {
  it("adds a hooks.PostToolUse entry on an existing file, preserving other keys", () => {
    const settings = { env: { FOO: "bar" } };
    const next = installEntry(settings, FRAGMENT, "bash:pnpm-test-abc12345");

    expect(next.env).toEqual({ FOO: "bar" });
    expect(next.hooks?.PostToolUse).toEqual([
      {
        matcher: "Bash",
        hooks: [
          {
            type: "command",
            command: "node .mm/hooks/guard.mjs bash:pnpm-test-abc12345 -- pnpm test",
            timeout: 5,
          },
        ],
      },
    ]);
  });

  it("does not duplicate the entry on re-install of the identical fragment", () => {
    const once = installEntry({}, FRAGMENT, "bash:pnpm-test-abc12345");
    const twice = installEntry(once, FRAGMENT, "bash:pnpm-test-abc12345");

    expect(twice.hooks?.PostToolUse).toHaveLength(1);
  });

  it("keeps other hook events untouched", () => {
    const settings = { hooks: { PreToolUse: [{ matcher: "*", hooks: [] }] } };
    const next = installEntry(settings, FRAGMENT, "bash:pnpm-test-abc12345");

    expect(next.hooks?.PreToolUse).toEqual([{ matcher: "*", hooks: [] }]);
    expect(next.hooks?.PostToolUse).toHaveLength(1);
  });
});

describe("removeEntry", () => {
  it("removes the entry matching the given id", () => {
    const installed = installEntry({}, FRAGMENT, "bash:pnpm-test-abc12345");
    const next = removeEntry(installed, "bash:pnpm-test-abc12345");

    expect(next.hooks).toBeUndefined();
  });

  it("is a no-op when the id is absent", () => {
    const settings = installEntry({}, FRAGMENT, "bash:pnpm-test-abc12345");
    const next = removeEntry(settings, "some-other-id");

    expect(next).toEqual(settings);
  });

  it("drops only the matching entry, keeping siblings and other hook events", () => {
    const other: HookFragment = { ...FRAGMENT, command: "pnpm lint" };
    let settings = installEntry({}, FRAGMENT, "id-one");
    settings = installEntry(settings, other, "id-two");
    settings = { ...settings, hooks: { ...settings.hooks, PreToolUse: [{ matcher: "*", hooks: [] }] } };

    const next = removeEntry(settings, "id-one");

    expect(next.hooks?.PostToolUse).toHaveLength(1);
    expect(next.hooks?.PostToolUse?.[0]?.hooks[0]?.command).toContain("id-two");
    expect(next.hooks?.PreToolUse).toEqual([{ matcher: "*", hooks: [] }]);
  });
});

describe("writeSettings", () => {
  it("writes JSON.stringify(settings, null, 2) + newline", () => {
    const path = join(root, "settings.json");
    writeSettings(path, { env: { FOO: "bar" } });

    expect(readFileSync(path, "utf8")).toBe(`${JSON.stringify({ env: { FOO: "bar" } }, null, 2)}\n`);
  });
});
