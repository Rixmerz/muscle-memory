/**
 * The HTTP client for `laya-serve` (`POST /v1/systemone`, `GET /health`).
 * Every call goes to a resident server: a cold Laya load is ~30 s, far past
 * any hook timeout, so nothing here ever spawns Python.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import type { LayaAnswer } from "./decide.js";
import type { Definition } from "./definition.js";

export const DEFAULT_URL = "http://127.0.0.1:8177";

export interface LayaConfig {
  url: string;
  python: string;
  device: string;
  models: string;
}

export function config(env: NodeJS.ProcessEnv = process.env): LayaConfig {
  return {
    url: env.MM_LAYA_URL || DEFAULT_URL,
    python: env.MM_LAYA_PYTHON || join(homedir(), ".local", "share", "muscle-memory", "laya", "bin", "python"),
    device: env.MM_LAYA_DEVICE || "cpu",
    models: env.MM_LAYA_MODELS || "english",
  };
}

/** Nothing answered at the URL: the one failure callers treat differently. */
export class ServerUnreachable extends Error {
  constructor(url: string) {
    super(`no Laya server at ${url}; start it with: mm-classifier server start`);
  }
}

async function request(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new ServerUnreachable(new URL(url).origin);
  }
}

export async function health(url: string, timeoutMs = 1000): Promise<boolean> {
  try {
    const res = await request(`${url}/health`, {}, timeoutMs);
    return res.ok;
  } catch {
    return false;
  }
}

export interface Prediction {
  answers: Record<string, LayaAnswer>;
  model: string | null;
}

export async function predict(
  url: string,
  definition: Definition,
  state: unknown,
  timeoutMs = 30_000,
): Promise<Prediction> {
  const body: Record<string, unknown> = { state, questions: definition.questions };
  if (definition.model !== undefined) body.model = definition.model;
  const res = await request(
    `${url}/v1/systemone`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    timeoutMs,
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Laya server answered ${res.status}: ${text.slice(0, 300)}`);
  const parsed = JSON.parse(text) as { answers?: Record<string, LayaAnswer>; routing?: { model?: string } };
  if (parsed.answers === undefined) throw new Error("Laya server response has no answers");
  return { answers: parsed.answers, model: parsed.routing?.model ?? null };
}
