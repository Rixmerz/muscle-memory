/**
 * Exercises the built binary directly — exit code, stdout, and filesystem
 * side effects are the contract (spec.md). Requires `dist/bin.js` to exist,
 * i.e. `pnpm build` to have run first.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const BIN = fileURLToPath(new URL("../dist/bin.js", import.meta.url));

const HOOK_PROPOSAL = `# Pattern: bash:pnpm-test

## Steps

\`\`\`
bash:pnpm-test
\`\`\`

## Score: 0.85

| Factor | Value |
|---|---|
| frecuencia | 1.00 |

## Suggested target: \`hook\`

Every occurrence runs the identical bash command, so this pattern can fire unattended as a hook.
`;

const SLASH_COMMAND_PROPOSAL = `# Pattern: bash:pnpm-test -> edit:java

## Steps

\`\`\`
bash:pnpm-test
edit:java
\`\`\`

## Score: 0.85

| Factor | Value |
|---|---|
| frecuencia | 1.00 |

## Suggested target: \`slash-command\`

This pattern mixes tools or commands, so it needs a human to trigger it as a slash command rather than firing automatically.
`;

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "mm-builder-bin-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function run(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function writeProposal(name: string, markdown: string): string {
  const file = join(root, name);
  writeFileSync(file, markdown);
  return file;
}

function seedSettingsFile(): string {
  const settingsFile = join(root, ".claude", "settings.json");
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(settingsFile, "{}\n");
  return settingsFile;
}

describe("mm-build bin", () => {
  // Scenario: command omitted
  it("exits 1 stating --command is required, and writes nothing", () => {
    const file = writeProposal("proposal.md", HOOK_PROPOSAL);
    const { status, stderr } = run([file]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/--command is required/);
    expect(existsSync(join(root, ".mm"))).toBe(false);
  });

  // Scenario: slash-command proposal rejected
  it("refuses a slash-command target proposal and writes nothing", () => {
    const file = writeProposal("proposal.md", SLASH_COMMAND_PROPOSAL);
    const { status, stderr } = run([file, "--command", "pnpm test"]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/slash-command build is not implemented/);
    expect(existsSync(join(root, ".mm"))).toBe(false);
  });

  // Scenario: file is not a proposal
  it("exits 1 naming the file and stating it is not a muscle-memory proposal", () => {
    const file = writeProposal("not-a-proposal.md", "# Just some notes\n");
    const { status, stderr } = run([file, "--command", "pnpm test"]);
    expect(status).toBe(1);
    expect(stderr).toContain(file);
    expect(stderr).toMatch(/not a muscle-memory proposal/);
  });

  // Scenario: command does not match the mined signature
  it("exits 1 showing both signatures on a mismatched command, and writes nothing", () => {
    const file = writeProposal("proposal.md", HOOK_PROPOSAL);
    const { status, stderr } = run([file, "--command", "rm -rf node_modules"]);
    expect(status).toBe(1);
    expect(stderr).toContain("bash:pnpm-test");
    expect(existsSync(join(root, ".mm"))).toBe(false);
  });

  // Scenario: fragment shape
  it("prints the fragment as JSON on a matching command without --write", () => {
    const file = writeProposal("proposal.md", HOOK_PROPOSAL);
    const { status, stdout } = run([file, "--command", "pnpm test"]);
    expect(status).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      event: "PostToolUse",
      matcher: "Bash",
      command: "pnpm test",
      sourceSignature: "bash:pnpm-test",
    });
    expect(existsSync(join(root, ".mm"))).toBe(false);
  });

  // Scenario: --write creates a tracked file
  it("--write persists the fragment under .mm/hooks/", () => {
    const file = writeProposal("proposal.md", HOOK_PROPOSAL);
    const { status } = run([file, "--command", "pnpm test", "--write"]);
    expect(status).toBe(0);

    const hooksDir = join(root, ".mm", "hooks");
    expect(existsSync(hooksDir)).toBe(true);
    const files = readdirSync(hooksDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}-pnpm-test\.json$/);

    const written = JSON.parse(readFileSync(join(hooksDir, files[0] as string), "utf8"));
    expect(written).toEqual({
      event: "PostToolUse",
      matcher: "Bash",
      command: "pnpm test",
      sourceSignature: "bash:pnpm-test",
    });
  });

  // Scenario: no settings.json write ever happens
  it("leaves .claude/settings.json byte-for-byte unchanged, with or without --write", () => {
    const file = writeProposal("proposal.md", HOOK_PROPOSAL);
    const settingsFile = seedSettingsFile();
    const before = readFileSync(settingsFile, "utf8");

    run([file, "--command", "pnpm test"]);
    run([file, "--command", "pnpm test", "--write"]);
    run([file, "--command", "rm -rf node_modules"]);

    expect(readFileSync(settingsFile, "utf8")).toBe(before);
  });

  it("creates no .claude/settings.json when none existed, with or without --write", () => {
    const file = writeProposal("proposal.md", HOOK_PROPOSAL);

    run([file, "--command", "pnpm test"]);
    run([file, "--command", "pnpm test", "--write"]);

    expect(existsSync(join(root, ".claude", "settings.json"))).toBe(false);
  });
});
