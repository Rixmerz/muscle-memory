/**
 * Drives start/stop/status against a fake interpreter: a shell script that,
 * run as `-m laya.serve`, serves /health on LAYA_HOST:LAYA_PORT and dumps the
 * environment it was given, and run as `-I -c ...` prints a version.
 */
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LayaConfig } from "./laya.js";
import { serverEnv, start, status, stop } from "./server.js";
import { DEAD_URL, startStub } from "./stub-server.fixture.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mm-classifier-server-"));
});
afterEach(() => {
  stop(dir);
  rmSync(dir, { recursive: true, force: true });
});

async function freePort(): Promise<number> {
  return new Promise((done) => {
    const probe = createServer().listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => done(port));
    });
  });
}

function fakePython(body: "serve" | "crash"): string {
  const server = join(dir, "fake-serve.mjs");
  writeFileSync(
    server,
    `import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(join(dir, "env.json"))}, JSON.stringify(process.env));
createServer((req, res) => res.end("{}")).listen(Number(process.env.LAYA_PORT), process.env.LAYA_HOST);
`,
  );
  const script = join(dir, "python");
  const serve = body === "serve" ? `exec "${process.execPath}" "${server}"` : "exit 1";
  writeFileSync(script, `#!/bin/sh\nif [ "$1" = "-I" ]; then echo 0.3.20; exit 0; fi\n${serve}\n`);
  chmodSync(script, 0o755);
  return script;
}

function cfg(python: string, url: string): LayaConfig {
  return { python, url, device: "cpu", models: "english" };
}

describe("serverEnv", () => {
  it("binds loopback on the URL's port and hides CUDA on CPU", () => {
    const env = serverEnv(cfg("/p", "http://127.0.0.1:8177"), {});
    expect(env).toMatchObject({ LAYA_HOST: "127.0.0.1", LAYA_PORT: "8177", LAYA_DEVICE: "cpu", LAYA_MODELS: "english", CUDA_VISIBLE_DEVICES: "" });
  });

  it("leaves CUDA visible for a non-CPU device", () => {
    const env = serverEnv({ ...cfg("/p", "http://127.0.0.1:8177"), device: "cuda" }, {});
    expect(env.CUDA_VISIBLE_DEVICES).toBeUndefined();
  });
});

describe("start", () => {
  it("refuses a missing interpreter and names the install command", async () => {
    await expect(start(cfg(join(dir, "nope", "bin", "python"), DEAD_URL), 1, dir)).rejects.toThrow(
      /no Python interpreter.*mm-classifier setup/s,
    );
  });

  it("does nothing when a server already answers", async () => {
    const stub = await startStub();
    try {
      expect(await start(cfg(join(dir, "nope"), stub.url), 1, dir)).toMatch(/already running/);
      expect(existsSync(join(dir, "laya-serve.pid"))).toBe(false);
    } finally {
      await stub.close();
    }
  });

  it("launches on 127.0.0.1 with CUDA hidden, then stop terminates it", async () => {
    const url = `http://127.0.0.1:${await freePort()}`;
    expect(await start(cfg(fakePython("serve"), url), 10, dir)).toMatch(/running at/);
    const env = JSON.parse(readFileSync(join(dir, "env.json"), "utf8"));
    expect(env).toMatchObject({ LAYA_HOST: "127.0.0.1", LAYA_DEVICE: "cpu", CUDA_VISIBLE_DEVICES: "" });
    expect(stop(dir)).toMatch(/stopped/);
    expect(existsSync(join(dir, "laya-serve.pid"))).toBe(false);
  });

  it("fails fast with the log path when the server exits during startup", async () => {
    const url = `http://127.0.0.1:${await freePort()}`;
    await expect(start(cfg(fakePython("crash"), url), 10, dir)).rejects.toThrow(/exited during startup.*laya-serve\.log/);
  });
});

describe("stop and status", () => {
  it("reports when no server was started", () => {
    expect(stop(dir)).toMatch(/no Laya server started/);
  });

  it("reports interpreter, version and liveness", async () => {
    const s = await status(cfg(fakePython("serve"), DEAD_URL));
    expect(s).toMatchObject({ pythonExists: true, layaVersion: "0.3.20", running: false });
    const missing = await status(cfg(join(dir, "none"), DEAD_URL));
    expect(missing).toMatchObject({ pythonExists: false, layaVersion: null });
  });
});
