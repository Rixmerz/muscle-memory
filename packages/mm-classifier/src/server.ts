/**
 * One resident `laya-serve`, started and stopped only by an explicit command,
 * never by a hook. Bound to 127.0.0.1 (laya-serve's own default is 0.0.0.0,
 * an unauthenticated endpoint on the LAN) and on CPU by default: a resident
 * CUDA context keeps a hybrid laptop's discrete GPU awake.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { health, type LayaConfig } from "./laya.js";

export function stateDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "muscle-memory");
}

/** The environment `laya.serve` reads its whole configuration from. */
export function serverEnv(cfg: LayaConfig, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...base,
    LAYA_HOST: "127.0.0.1",
    LAYA_PORT: new URL(cfg.url).port || "80",
    LAYA_DEVICE: cfg.device,
    LAYA_MODELS: cfg.models,
    LAYA_PRELOAD: "1",
  };
  if (cfg.device === "cpu") env.CUDA_VISIBLE_DEVICES = "";
  return env;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Resolves to the message to print; throws when the server never answers. */
export async function start(cfg: LayaConfig, waitSeconds: number, dir = stateDir()): Promise<string> {
  if (await health(cfg.url)) return `Laya server already running at ${cfg.url}`;
  if (!existsSync(cfg.python)) {
    throw new Error(`no Python interpreter at ${cfg.python}; install Laya with: mm-classifier setup (or set MM_LAYA_PYTHON)`);
  }

  mkdirSync(dir, { recursive: true });
  const logPath = join(dir, "laya-serve.log");
  const log = openSync(logPath, "a");
  const child = spawn(cfg.python, ["-m", "laya.serve"], {
    detached: true,
    stdio: ["ignore", log, log],
    env: serverEnv(cfg),
  });
  child.unref();
  const pid = child.pid;
  if (pid === undefined) throw new Error(`could not start ${cfg.python}; see ${logPath}`);
  writeFileSync(join(dir, "laya-serve.pid"), `${pid}\n`);

  const deadline = Date.now() + waitSeconds * 1000;
  while (Date.now() < deadline) {
    if (await health(cfg.url)) return `Laya server running at ${cfg.url} (pid ${pid}, device ${cfg.device}, log ${logPath})`;
    if (!alive(pid)) throw new Error(`Laya server exited during startup; see ${logPath}`);
    await sleep(500);
  }
  throw new Error(`Laya server did not answer within ${waitSeconds}s; see ${logPath}`);
}

export function stop(dir = stateDir()): string {
  const pidPath = join(dir, "laya-serve.pid");
  if (!existsSync(pidPath)) return "no Laya server started by mm-classifier";
  const pid = Number(readFileSync(pidPath, "utf8").trim());
  rmSync(pidPath);
  if (!Number.isInteger(pid) || !alive(pid)) return "Laya server was not running";
  process.kill(pid, "SIGTERM");
  return `stopped Laya server (pid ${pid})`;
}

export interface Status {
  python: string;
  pythonExists: boolean;
  layaVersion: string | null;
  running: boolean;
  url: string;
}

export async function status(cfg: LayaConfig): Promise<Status> {
  const pythonExists = existsSync(cfg.python);
  let layaVersion: string | null = null;
  if (pythonExists) {
    const probe = spawnSync(cfg.python, ["-I", "-c", "import laya; print(laya.__version__)"], {
      encoding: "utf8",
      timeout: 30_000,
    });
    if (probe.status === 0) layaVersion = probe.stdout.trim();
  }
  return { python: cfg.python, pythonExists, layaVersion, running: await health(cfg.url), url: cfg.url };
}
