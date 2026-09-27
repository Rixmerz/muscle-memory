/**
 * The install sequence against a fake runner: the commands `setup` would run,
 * in order, without downloading anything. The fake "creates" the interpreter
 * when the venv step runs and "installs" Laya when laya[serve] is installed.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LayaConfig } from "./laya.js";
import { setup, type Prober, type Runner } from "./setup.js";

let dir: string;
let python: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mm-classifier-setup-"));
  python = join(dir, "laya", "bin", "python");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

interface Fake {
  calls: string[];
  run: Runner;
  probe: Prober;
}

function fake(opts: { uv: boolean; python3?: string; installed?: boolean; fail?: string }): Fake {
  let installed = opts.installed ?? false;
  const calls: string[] = [];
  const run: Runner = (command, args) => {
    const line = `${command} ${args.join(" ")}`;
    calls.push(line);
    if (opts.fail !== undefined && line.includes(opts.fail)) return 1;
    if (args.includes("venv")) {
      mkdirSync(dirname(python), { recursive: true });
      writeFileSync(python, "");
    }
    if (args.includes("laya[serve]")) installed = true;
    return 0;
  };
  const probe: Prober = (command, args) => {
    if (command === "uv") return opts.uv ? "uv 0.12.5" : null;
    if (command === "python3") return opts.python3 ?? null;
    if (args.join(" ").includes("import laya")) return installed ? "0.3.20" : null;
    return null;
  };
  return { calls, run, probe };
}

function cfg(device = "cpu", models = "english"): LayaConfig {
  return { python, url: "http://127.0.0.1:8177", device, models };
}

const quiet = { download: true, log: () => {} };

describe("setup", () => {
  it("with uv: creates a 3.12 venv, installs CPU torch and laya[serve], downloads the checkpoints", () => {
    const f = fake({ uv: true });
    expect(setup(cfg("cpu", "english,multilingual"), quiet, f.run, f.probe)).toBe("0.3.20");
    expect(f.calls).toEqual([
      `uv venv --python 3.12 ${join(dir, "laya")}`,
      `uv pip install --python ${python} --index-url https://download.pytorch.org/whl/cpu torch`,
      `uv pip install --python ${python} laya[serve]`,
      `${python} -c from laya import Router; Router(device="cpu").preload(["english", "multilingual"])`,
    ]);
  });

  it("without uv: uses python3 -m venv and pip", () => {
    const f = fake({ uv: false, python3: "3.12" });
    setup(cfg(), { ...quiet, download: false }, f.run, f.probe);
    expect(f.calls).toEqual([
      `python3 -m venv ${join(dir, "laya")}`,
      `${python} -m pip install --index-url https://download.pytorch.org/whl/cpu torch`,
      `${python} -m pip install laya[serve]`,
    ]);
  });

  it("refuses without uv when python3 is older than 3.10", () => {
    const f = fake({ uv: false, python3: "3.9" });
    expect(() => setup(cfg(), quiet, f.run, f.probe)).toThrow(/Python >= 3\.10.*3\.9/);
    expect(f.calls).toEqual([]);
  });

  it("installs the default torch build for a non-CPU device", () => {
    const f = fake({ uv: true });
    setup(cfg("cuda"), { ...quiet, download: false }, f.run, f.probe);
    expect(f.calls[1]).toBe(`uv pip install --python ${python} torch`);
  });

  it("leaves an existing install alone and only downloads", () => {
    mkdirSync(dirname(python), { recursive: true });
    writeFileSync(python, "");
    const f = fake({ uv: true, installed: true });
    expect(setup(cfg(), quiet, f.run, f.probe)).toBe("0.3.20");
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]).toMatch(/preload\(\["english"\]\)/);
  });

  it("reuses an existing interpreter that lacks Laya", () => {
    mkdirSync(dirname(python), { recursive: true });
    writeFileSync(python, "");
    const f = fake({ uv: true });
    setup(cfg(), { ...quiet, download: false }, f.run, f.probe);
    expect(f.calls.some((c) => c.includes("venv"))).toBe(false);
    expect(f.calls).toHaveLength(2);
  });

  it("names the step that failed and stops there", () => {
    const f = fake({ uv: true, fail: "torch" });
    expect(() => setup(cfg(), quiet, f.run, f.probe)).toThrow(/install torch/);
    expect(f.calls).toHaveLength(2);
  });
});
