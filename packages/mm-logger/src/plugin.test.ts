/**
 * Checks the shipped plugin, not the source it came from: the bundle a
 * `git-subdir` install copies, and the two manifests that decide whether
 * Claude Code loads it at all. Nothing here has a compiler behind it —
 * hooks.json is data, and a typo in an event name fails silently at runtime
 * by never firing.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import { HOOK_EVENT_NAMES } from "@muscle-memory/core";
import { describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const BUNDLE = join(REPO, "plugin", "bin", "mm-log.mjs");

function readJson(...segments: string[]): Record<string, any> {
  return JSON.parse(readFileSync(join(REPO, ...segments), "utf8"));
}

describe("the shipped bundle", () => {
  it("imports nothing but Node builtins", () => {
    // A `git-subdir` install copies files and runs no package manager, so an
    // import of anything else resolves to a directory that will not be there.
    const imports = [...readFileSync(BUNDLE, "utf8").matchAll(/^import .* from "(.+)";$/gm)].map(
      (match) => match[1]!,
    );

    expect(imports.length).toBeGreaterThan(0);
    for (const specifier of imports) {
      expect(specifier).toMatch(/^node:/);
    }
  });

  it("is byte-identical to a fresh build from the same source", () => {
    // Committed build output is only auditable if a rebuild reproduces it.
    // Same flags as the root `bundle` script; keep them in step.
    const out = join(mkdtempSync(join(tmpdir(), "mm-bundle-")), "mm-log.mjs");
    buildSync({
      entryPoints: [join(REPO, "packages", "mm-logger", "dist", "bin.js")],
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node22",
      outfile: out,
    });

    expect(readFileSync(out)).toEqual(readFileSync(BUNDLE));
  });

  it("records a tool call when run as the plugin would run it", () => {
    const root = mkdtempSync(join(tmpdir(), "mm-plugin-smoke-"));
    mkdirSync(join(root, ".mm"), { recursive: true });

    const result = spawnSync(process.execPath, [BUNDLE, "PreToolUse"], {
      cwd: root,
      input: JSON.stringify({
        session_id: "s1",
        cwd: root,
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "pnpm test" },
      }),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);

    const day = new Date().toISOString().slice(0, 10);
    const lines = readFileSync(join(root, ".mm", "events", `${day}.ndjson`), "utf8")
      .trim()
      .split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).tool).toBe("Bash");

    rmSync(root, { recursive: true, force: true });
  });

  it("stays inert when run as the plugin would run it in a repository that never opted in", () => {
    const root = mkdtempSync(join(tmpdir(), "mm-plugin-inert-"));

    const result = spawnSync(process.execPath, [BUNDLE, "PreToolUse"], {
      cwd: root,
      input: JSON.stringify({ session_id: "s1", cwd: root, hook_event_name: "PreToolUse" }),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(readdirSync(root)).toHaveLength(0);

    rmSync(root, { recursive: true, force: true });
  });
});

describe("the plugin manifests", () => {
  const plugin = readJson("plugin", ".claude-plugin", "plugin.json");
  const marketplace = readJson(".claude-plugin", "marketplace.json");

  it("declares a name, a version and a description", () => {
    for (const field of ["name", "version", "description"] as const) {
      expect(typeof plugin[field]).toBe("string");
      expect(plugin[field]).not.toBe("");
    }
  });

  it("is listed in the marketplace under the same name", () => {
    // A mismatch installs, appears in the list, and loads nothing.
    const entry = marketplace["plugins"].find((p: any) => p.name === plugin["name"]);
    expect(entry).toBeDefined();
    expect(entry.source.path).toBe("plugin");
  });

  it("registers only event names the logger knows", () => {
    const registered = Object.keys(readJson("plugin", "hooks", "hooks.json")["hooks"]);

    expect(registered.length).toBeGreaterThan(0);
    for (const event of registered) {
      expect(HOOK_EVENT_NAMES).toContain(event);
    }
  });

  it("runs nothing from outside the plugin directory", () => {
    // Every command has to resolve through ${CLAUDE_PLUGIN_ROOT}: an absolute
    // path here is a path on the author's machine, and a bare relative one
    // resolves against whatever directory Claude Code happened to start in.
    const hooks = readJson("plugin", "hooks", "hooks.json")["hooks"];
    const commands = Object.values(hooks)
      .flat()
      .flatMap((matcher: any) => matcher.hooks)
      .map((hook: any) => hook.command as string);

    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) {
      expect(command).toContain("${CLAUDE_PLUGIN_ROOT}/bin/mm-log.mjs");
      expect(command).not.toMatch(/(^|\s)\/(Users|home|opt|usr)\//);
    }
  });
});
