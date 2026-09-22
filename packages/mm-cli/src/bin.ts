#!/usr/bin/env node
/**
 * `mm run [--min-score 0.8] [--build <n> --command "<cmd>" [--install]]` —
 * the orchestrator over the pipeline M1-M5 shipped as four separate CLIs:
 * mines and scores candidates (`@muscle-memory/aggregator`'s `candidates()`),
 * renders them (`@muscle-memory/learner`'s `formatProposal`), builds a hook
 * fragment from a selected candidate (`@muscle-memory/builder`'s
 * `buildHook`), and installs it (`@muscle-memory/installer`'s install
 * sequence) — all in-process, never shelling out to those packages' own
 * CLIs (design.md).
 *
 * Each import below is a deep import into the dependency's `dist/`, not its
 * public entry point, matching the same pattern `mm-learner/src/bin.ts`
 * already uses against `@muscle-memory/aggregator`: none of these four
 * packages' barrels (`src/index.ts`) export the symbols `mm run` needs, and
 * this change's constraints forbid editing their internals. Each deep import
 * resolves because none of these packages' `package.json` declares an
 * `exports` map restricting subpath resolution (unlike `@muscle-memory/core`,
 * which does and is why this file has no deep import into it).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { candidates, type ScoredPattern } from "@muscle-memory/aggregator/dist/candidates.js";
import { formatProposal } from "@muscle-memory/learner/dist/proposal.js";
import { buildHook, type HookFragment } from "@muscle-memory/builder/dist/hook.js";
import { deriveId, GUARD_SOURCE, type InstallRecord } from "@muscle-memory/installer/dist/guard.js";
import { installEntry, readSettings, writeSettings } from "@muscle-memory/installer/dist/settings.js";

const DEFAULT_MIN_SCORE = 0.8;

interface Args {
  minScore: number;
  build: number | undefined;
  command: string | undefined;
  install: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  let minScore = DEFAULT_MIN_SCORE;
  let build: number | undefined;
  let command: string | undefined;
  let install = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--min-score") {
      const raw = argv[i + 1];
      const parsed = raw !== undefined ? Number(raw) : NaN;
      if (Number.isFinite(parsed)) minScore = parsed;
      i++;
    } else if (arg === "--build") {
      const raw = argv[i + 1];
      const parsed = raw !== undefined ? Number(raw) : NaN;
      if (Number.isFinite(parsed)) build = parsed;
      i++;
    } else if (arg === "--command") {
      command = argv[i + 1];
      i++;
    } else if (arg === "--install") {
      install = true;
    }
  }

  return { minScore, build, command, install };
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function printProposals(results: readonly ScoredPattern[]): void {
  results.forEach((candidate, i) => {
    const proposal = formatProposal(candidate);
    process.stdout.write(`[${i}] ${proposal.markdown}`);
  });
}

function selectCandidate(results: readonly ScoredPattern[], index: number): ScoredPattern {
  const candidate = results[index];
  if (candidate === undefined) {
    fail(`--build ${index}: out of range, only ${results.length} candidate(s) mined`);
  }
  return candidate;
}

/** Same install sequence as `mm-install install`
 * (`packages/mm-installer/src/bin.ts:88-111`), inlined instead of shelled
 * out to (design.md § `src/bin.ts` dispatch). */
function install(root: string, fragment: HookFragment): string {
  const id = deriveId(fragment);
  const hooksDir = join(root, ".mm", "hooks");
  const guardPath = join(hooksDir, "guard.mjs");

  mkdirSync(hooksDir, { recursive: true });
  if (!existsSync(guardPath)) {
    writeFileSync(guardPath, GUARD_SOURCE);
  }

  const settingsPath = join(root, ".claude", "settings.json");
  const settings = readSettings(settingsPath);
  writeSettings(settingsPath, installEntry(settings, fragment, id));

  const record: InstallRecord = {
    id,
    sourceSignature: fragment.sourceSignature,
    command: fragment.command,
    installedAt: new Date().toISOString(),
  };
  writeFileSync(join(hooksDir, `${id}.install.json`), `${JSON.stringify(record, null, 2)}\n`);

  return id;
}

function main(): void {
  const { minScore, build, command, install: shouldInstall } = parseArgs(process.argv.slice(2));

  if (shouldInstall && build === undefined) {
    fail("--install requires --build");
  }

  const root = process.cwd();
  const results = candidates(root, { minScore });

  if (build === undefined) {
    printProposals(results);
    process.exit(0);
  }

  const candidate = selectCandidate(results, build);
  const proposal = formatProposal(candidate);

  if (proposal.target === "slash-command") {
    fail("mm build only compiles `hook` proposals; slash-command build is not implemented.");
  }

  if (!command) {
    fail("--command is required: mm build never invents the automation it installs.");
  }

  // A `hook`-classified candidate's steps are, by `formatProposal`'s own
  // `classify` (packages/mm-learner/src/proposal.ts:34-39), all the same
  // bash signature repeated — but `@muscle-memory/aggregator`'s mining
  // window is at least 2 steps wide (`WINDOW.minLen` in
  // packages/mm-aggregator/src/candidates.ts:20), so a real hook candidate
  // never arrives with exactly one. `buildHook` only accepts exactly one
  // (packages/mm-builder/src/hook.ts:17-21), and the repeated value carries
  // no extra information, so the single distinct step is what gets built.
  const [firstStep] = candidate.steps;
  if (firstStep === undefined) {
    fail("selected candidate has no steps");
  }

  let fragment: HookFragment;
  try {
    fragment = buildHook([firstStep], command);
  } catch (err) {
    fail((err as Error).message);
  }

  if (!shouldInstall) {
    process.stdout.write(`${JSON.stringify(fragment, null, 2)}\n`);
    process.exit(0);
  }

  const id = install(root, fragment);
  process.stdout.write(`${id}\n`);
  process.exit(0);
}

main();
