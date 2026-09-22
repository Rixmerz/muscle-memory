#!/usr/bin/env node
/**
 * `mm build <proposal-file> --command "<real command>" [--write]` — parses
 * a proposal written by M3's `mm propose --write`, validates the human's
 * `--command` against its mined signature, and renders a `PostToolUse` hook
 * fragment (design.md § CLI). Never writes to `.claude/settings.json`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseProposal } from "./proposal-parser.js";
import { buildHook } from "./hook.js";

interface Args {
  file: string | undefined;
  command: string | undefined;
  write: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  let file: string | undefined;
  let command: string | undefined;
  let write = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--command") {
      command = argv[i + 1];
      i++;
    } else if (arg === "--write") {
      write = true;
    } else if (file === undefined && !arg?.startsWith("-")) {
      file = arg;
    }
  }

  return { file, command, write };
}

/** Kebab-cased, truncated slug of the human-supplied command (design.md,
 * matching `mm-learner/src/bin.ts`'s `slugify`). */
function slugify(command: string): string {
  const slug = command
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, 60);
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function main(): void {
  const { file, command, write } = parseArgs(process.argv.slice(2));

  if (!file) {
    fail("a proposal file is required: mm build <proposal-file> --command \"<cmd>\"");
  }

  let markdown: string;
  try {
    markdown = readFileSync(file, "utf8");
  } catch {
    fail(`${file}: not a muscle-memory proposal (could not be read)`);
  }

  let parsed: ReturnType<typeof parseProposal>;
  try {
    parsed = parseProposal(markdown);
  } catch (err) {
    fail(`${file}: not a muscle-memory proposal (${(err as Error).message})`);
  }

  if (parsed.target === "slash-command") {
    fail("mm build only compiles `hook` proposals; slash-command build is not implemented.");
  }

  if (!command) {
    fail("--command is required: mm build never invents the automation it installs.");
  }

  let fragment: ReturnType<typeof buildHook>;
  try {
    fragment = buildHook(parsed.steps, command);
  } catch (err) {
    fail((err as Error).message);
  }

  const json = JSON.stringify(fragment, null, 2);
  process.stdout.write(`${json}\n`);

  if (write) {
    const root = process.cwd();
    const date = new Date().toISOString().slice(0, 10);
    const dir = join(root, ".mm", "hooks");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${date}-${slugify(command)}.json`), `${json}\n`);
  }

  process.exit(0);
}

main();
