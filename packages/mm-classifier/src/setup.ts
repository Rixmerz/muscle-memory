/**
 * `mm-classifier setup`: the one command that turns "Laya is missing" into
 * a working interpreter — virtualenv, torch, `laya[serve]`, checkpoints.
 * Idempotent: an interpreter that already imports Laya is left alone.
 *
 * Every external command goes through a `Runner`, so the sequence is
 * testable without downloading a gigabyte of wheels.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import type { LayaConfig } from "./laya.js";

/** Runs a command with output passed through; resolves to its exit code. */
export type Runner = (command: string, args: readonly string[]) => number;

/** Runs a command quietly; its trimmed stdout, or `null` when it failed. */
export type Prober = (command: string, args: readonly string[]) => string | null;

export const defaultRunner: Runner = (command, args) =>
  spawnSync(command, args, { stdio: "inherit" }).status ?? 1;

export const defaultProber: Prober = (command, args) => {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 60_000 });
  return result.status === 0 ? result.stdout.trim() : null;
};

/** The Python version the CPU torch wheels were verified against. */
export const PYTHON_VERSION = "3.12";

const CPU_TORCH_INDEX = "https://download.pytorch.org/whl/cpu";

export interface SetupOptions {
  download: boolean;
  log: (line: string) => void;
}

export function layaVersion(python: string, probe: Prober): string | null {
  if (!existsSync(python)) return null;
  return probe(python, ["-I", "-c", "import laya; print(laya.__version__)"]);
}

function step(run: Runner, log: SetupOptions["log"], what: string, command: string, args: string[]): void {
  log(`==> ${what}`);
  if (run(command, args) !== 0) throw new Error(`setup failed while trying to ${what}: ${command} ${args.join(" ")}`);
}

/** Checkpoint names from `MM_LAYA_MODELS`, as a Python list literal. */
function pythonList(models: string): string {
  const names = models.split(",").map((m) => m.trim()).filter(Boolean);
  return `[${names.map((n) => JSON.stringify(n)).join(", ")}]`;
}

/** Resolves to the installed Laya version. Throws naming the failed step. */
export function setup(
  cfg: LayaConfig,
  options: SetupOptions,
  run: Runner = defaultRunner,
  probe: Prober = defaultProber,
): string {
  const { log } = options;
  const existing = layaVersion(cfg.python, probe);

  if (existing !== null) {
    log(`Laya ${existing} is already installed at ${cfg.python}`);
  } else {
    const venv = dirname(dirname(cfg.python));
    const uv = probe("uv", ["--version"]) !== null;

    if (!existsSync(cfg.python)) {
      if (uv) {
        // uv fetches a managed 3.12 when the system Python is too new for torch wheels.
        step(run, log, `create a Python ${PYTHON_VERSION} virtualenv at ${venv}`, "uv", ["venv", "--python", PYTHON_VERSION, venv]);
      } else {
        const version = probe("python3", ["-c", "import sys; print('%d.%d' % sys.version_info[:2])"]);
        const [major = 0, minor = 0] = (version ?? "").split(".").map(Number);
        if (major < 3 || (major === 3 && minor < 10)) {
          throw new Error(`Laya needs Python >= 3.10 and uv is not installed; found python3 ${version ?? "missing"}`);
        }
        step(run, log, `create a virtualenv at ${venv}`, "python3", ["-m", "venv", venv]);
      }
    }

    const pip = (packages: string[]): [string, string[]] =>
      uv ? ["uv", ["pip", "install", "--python", cfg.python, ...packages]] : [cfg.python, ["-m", "pip", "install", ...packages]];

    // The CPU build is the default on purpose: the server stays resident, and a
    // resident CUDA context keeps a laptop's discrete GPU from powering down.
    const torch = cfg.device === "cpu" ? ["--index-url", CPU_TORCH_INDEX, "torch"] : ["torch"];
    step(run, log, `install torch (${cfg.device === "cpu" ? "CPU build" : "default build"})`, ...pip(torch));
    step(run, log, "install laya[serve]", ...pip(["laya[serve]"]));
  }

  const version = layaVersion(cfg.python, probe);
  if (version === null) throw new Error(`Laya still does not import from ${cfg.python}`);

  if (options.download) {
    step(run, log, `download the ${cfg.models} checkpoint(s) from Hugging Face`, cfg.python, [
      "-c",
      `from laya import Router; Router(device="cpu").preload(${pythonList(cfg.models)})`,
    ]);
  }
  return version;
}
