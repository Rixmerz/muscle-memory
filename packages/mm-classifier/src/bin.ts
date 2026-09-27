#!/usr/bin/env node
/**
 * `mm-classifier` — create, run, test and hook-adapt Laya-backed
 * classification flows.
 *
 *   new <name> (--store mm | --out <path>) [--force]   definition on stdin
 *   list
 *   run <name|path>                                    input JSON on stdin
 *   test <name|path> [--min-accuracy 1.0]
 *   hook <name|path>                                   hook payload on stdin
 *   hook-fragment <name|path> --event <E> [--matcher <M>]
 *   server start [--wait 120] | stop | status
 *   setup [--no-download]
 *
 * Exit codes: 0 ok, 1 usage or validation error, 3 Laya server unreachable.
 * `hook` always exits 0: a broken classifier must never block the agent.
 */
import { readFileSync } from "node:fs";
import { relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import type { Decision } from "./decide.js";
import { validate } from "./definition.js";
import { evaluate } from "./flow.js";
import { lint } from "./lint.js";
import { hookFragment, hookOutput } from "./hook.js";
import { config, ServerUnreachable } from "./laya.js";
import { start, status, stop } from "./server.js";
import { setup } from "./setup.js";
import { list, loadDefinition, resolveRef, targetPath, writeDefinition } from "./store.js";

const USAGE = `usage: mm-classifier <command>
  new <name> (--store mm | --out <path>) [--force]   read a definition from stdin and save it
  list                                               list classifiers in .mm/classifiers/
  run <name|path>                                    classify the JSON on stdin, print the decision
  test <name|path> [--min-accuracy 1.0]              run the classifier's own examples
  hook <name|path>                                   classify a Claude Code hook payload (fails open)
  hook-fragment <name|path> --event <E> [--matcher <M>]  print settings.json wiring, install nothing
  server start [--wait 120] | stop | status          manage the local Laya server
  setup [--no-download]                              install Laya and download its checkpoints`;

class UsageError extends Error {}

interface Parsed {
  positional: string[];
  flags: Map<string, string | true>;
}

const BOOLEAN_FLAGS = new Set(["--force", "--no-download"]);

function parse(argv: readonly string[]): Parsed {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      positional.push(arg);
    } else if (BOOLEAN_FLAGS.has(arg)) {
      flags.set(arg, true);
    } else {
      const value = argv[i + 1];
      if (value === undefined) throw new UsageError(`${arg} needs a value`);
      flags.set(arg, value);
      i++;
    }
  }
  return { positional, flags };
}

function flag(parsed: Parsed, name: string): string | undefined {
  const value = parsed.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

function numberFlag(parsed: Parsed, name: string, fallback: number): number {
  const raw = flag(parsed, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new UsageError(`${name}: not a number: ${raw}`);
  return value;
}

function ref(parsed: Parsed, command: string): string {
  const value = parsed.positional[1];
  if (value === undefined) throw new UsageError(`${command} needs <name|path>`);
  return value;
}

function readStdinJson(what: string): unknown {
  const text = readFileSync(0, "utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new UsageError(`stdin: expected ${what} as JSON`);
  }
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/** Under `hookFragment`'s 10 s timeout, so a slow first load (a checkpoint
 * loading lazily for non-English input takes ~20 s) reaches the fail-open
 * path instead of Claude Code killing the hook. */
const HOOK_REQUEST_TIMEOUT_MS = 8_000;

async function classify(path: string, input: unknown, timeoutMs?: number, follow = true): Promise<Decision> {
  return evaluate(path, input, { url: config().url, timeoutMs, follow });
}

function cmdNew(parsed: Parsed, root: string): void {
  const name = parsed.positional[1];
  if (name === undefined) throw new UsageError("new needs <name>");
  const raw = readStdinJson("a classifier definition");
  const definition = validate({ ...(raw as object), name });
  const path = targetPath(root, name, {
    store: flag(parsed, "--store"),
    out: flag(parsed, "--out"),
  });
  writeDefinition(path, definition, parsed.flags.has("--force"));
  printWarnings(definition);
  process.stdout.write(`${path}\n`);
}

function printWarnings(definition: Parameters<typeof lint>[0]): void {
  for (const warning of lint(definition)) process.stderr.write(`warning: ${warning}\n`);
}

function cmdList(root: string): void {
  for (const entry of list(root)) {
    if (entry.ok) process.stdout.write(`${entry.name}\t${entry.description}\n`);
    else process.stderr.write(`invalid: ${entry.error}\n`);
  }
}

async function cmdTest(parsed: Parsed, root: string): Promise<number> {
  const path = resolveRef(root, ref(parsed, "test"));
  const definition = loadDefinition(path);
  const minAccuracy = numberFlag(parsed, "--min-accuracy", 1);
  const examples = definition.examples ?? [];
  if (examples.length === 0) {
    process.stderr.write(`${definition.name} has no examples; a classifier cannot be trusted untested\n`);
    return 1;
  }
  printWarnings(definition);
  let hits = 0;
  const bySource = { rule: { n: 0, hits: 0 }, laya: { n: 0, hits: 0 } };
  for (const [i, example] of examples.entries()) {
    const decision = await classify(path, example.input, undefined, false);
    const ok = decision.label === example.expect;
    const source = decision.reason === "rule" ? bySource.rule : bySource.laya;
    source.n++;
    if (ok) {
      hits++;
      source.hits++;
    }
    process.stdout.write(
      `${ok ? "ok  " : "FAIL"} [${i}] expect=${example.expect} got=${decision.label} ` +
        `by=${decision.reason === "rule" ? "rule" : "laya"} confidence=${decision.confidence.toFixed(2)} ` +
        `outcome=${decision.outcome} (${decision.reason})\n`,
    );
  }
  const accuracy = hits / examples.length;
  process.stdout.write(
    `rules ${bySource.rule.hits}/${bySource.rule.n} · laya ${bySource.laya.hits}/${bySource.laya.n}` +
      (bySource.laya.n === 0 && bySource.rule.n > 0 ? " — no example reaches Laya, so this says nothing about it\n" : "\n"),
  );
  process.stdout.write(`accuracy ${accuracy.toFixed(2)} (${hits}/${examples.length}), minimum ${minAccuracy}\n`);
  return accuracy < minAccuracy ? 1 : 0;
}

/** Never throws, never exits non-zero: every failure is one stderr line. */
async function cmdHook(parsed: Parsed, root: string): Promise<void> {
  try {
    const path = resolveRef(root, ref(parsed, "hook"));
    const payload = readStdinJson("a hook payload") as Record<string, unknown>;
    const event = typeof payload.hook_event_name === "string" ? payload.hook_event_name : "";
    const output = hookOutput(event, await classify(path, payload, HOOK_REQUEST_TIMEOUT_MS));
    if (output !== null) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch (err) {
    process.stderr.write(`mm-classifier hook: ${(err as Error).message} (allowed)\n`);
  }
}

function cmdHookFragment(parsed: Parsed, root: string): void {
  const path = resolveRef(root, ref(parsed, "hook-fragment"));
  loadDefinition(path);
  const event = flag(parsed, "--event");
  if (event === undefined) throw new UsageError("hook-fragment needs --event <E>, e.g. PreToolUse");
  const rel = relative(root, path);
  // A classifier inside the project is referenced through $CLAUDE_PROJECT_DIR,
  // so the fragment keeps working from any cwd the hook is launched in.
  const classifierRef = rel.startsWith("..") || isAbsolute(rel) ? path : `$CLAUDE_PROJECT_DIR/${rel}`;
  const binPath = fileURLToPath(import.meta.url);
  print(hookFragment(event, flag(parsed, "--matcher") ?? "*", binPath, classifierRef));
}

async function cmdServer(parsed: Parsed): Promise<number> {
  const action = parsed.positional[1];
  const cfg = config();
  if (action === "start") {
    process.stdout.write(`${await start(cfg, numberFlag(parsed, "--wait", 120))}\n`);
    return 0;
  }
  if (action === "stop") {
    process.stdout.write(`${stop()}\n`);
    return 0;
  }
  if (action === "status") {
    const s = await status(cfg);
    process.stdout.write(
      `python  ${s.python}${s.pythonExists ? "" : " (missing)"}\n` +
        `laya    ${s.layaVersion ?? "not installed"}\n` +
        `server  ${s.url} ${s.running ? "running" : "not running"}\n`,
    );
    return s.running ? 0 : 1;
  }
  throw new UsageError("server needs start, stop or status");
}

async function main(argv: readonly string[]): Promise<number> {
  const parsed = parse(argv);
  const root = process.cwd();
  switch (parsed.positional[0]) {
    case "new":
      cmdNew(parsed, root);
      return 0;
    case "list":
      cmdList(root);
      return 0;
    case "run":
      print(await classify(resolveRef(root, ref(parsed, "run")), readStdinJson("an input")));
      return 0;
    case "test":
      return cmdTest(parsed, root);
    case "hook":
      await cmdHook(parsed, root);
      return 0;
    case "hook-fragment":
      cmdHookFragment(parsed, root);
      return 0;
    case "server":
      return cmdServer(parsed);
    case "setup": {
      const cfg = config();
      const version = setup(cfg, {
        download: !parsed.flags.has("--no-download"),
        log: (line) => process.stdout.write(`${line}\n`),
      });
      process.stdout.write(`Laya ${version} ready at ${cfg.python}; start it with: mm-classifier server start\n`);
      return 0;
    }
    default:
      throw new UsageError(USAGE);
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(err instanceof ServerUnreachable ? 3 : 1);
  },
);
