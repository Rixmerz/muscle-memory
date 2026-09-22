#!/usr/bin/env node
/**
 * Runs 200 sequential invocations of the built `mm-log` binary and reports
 * p50/p95/p99 wall time, process start to exit — Node's own startup
 * included, since the 30ms budget is about that (design.md, spec.md). Not a
 * vitest test: wired as the package's `bench` script so `pnpm test` never
 * runs it. Requires `pnpm build` first — it measures the shipped artifact,
 * not the TypeScript source.
 *
 * Both paths are measured, because the plugin registers `PreToolUse` on `*`
 * and the *inert* path is the one most people pay for: every tool call in
 * every repository that never opted in. It must be no slower than recording,
 * and the budget applies to it identically.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const BIN = fileURLToPath(new URL("./bin.js", import.meta.url));
const RUNS = 200;
const BUDGET_MS = 30;
const TOLERANCE_MS = 3;

function percentile(sorted: readonly number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  const value = sorted[Math.max(0, idx)];
  if (value === undefined) throw new Error("empty sample set");
  return value;
}

function measure(root: string, payload: string): number[] {
  const samples: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    // `cwd` is load-bearing: the consent gate reads the child's working
    // directory, so inheriting this process's would benchmark whichever path
    // the repository happens to be in rather than the one named here.
    spawnSync(process.execPath, [BIN], {
      cwd: root,
      input: payload,
      stdio: ["pipe", "ignore", "ignore"],
    });
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return samples;
}

function report(label: string, samples: readonly number[]): number {
  const p50 = percentile(samples, 50);
  const p95 = percentile(samples, 95);
  const p99 = percentile(samples, 99);
  console.log(
    `mm-log bench [${label}]: p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms p99=${p99.toFixed(2)}ms (n=${RUNS})`,
  );
  return p99;
}

function main(): void {
  const recording = mkdtempSync(join(tmpdir(), "mm-bench-on-"));
  const inert = mkdtempSync(join(tmpdir(), "mm-bench-off-"));
  mkdirSync(join(recording, ".mm"), { recursive: true });

  const payload = JSON.stringify({
    session_id: "bench",
    cwd: recording,
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "echo hi" },
  });

  let recordingP99: number;
  let inertP99: number;
  try {
    recordingP99 = report("recording", measure(recording, payload));
    inertP99 = report("inert", measure(inert, payload));
  } finally {
    rmSync(recording, { recursive: true, force: true });
    rmSync(inert, { recursive: true, force: true });
  }

  let failed = false;
  for (const [label, p99] of [["recording", recordingP99], ["inert", inertP99]] as const) {
    if (p99 > BUDGET_MS) {
      console.error(`mm-log bench: ${label} p99 ${p99.toFixed(2)}ms exceeds the ${BUDGET_MS}ms budget`);
      failed = true;
    }
  }

  // The inert path does strictly less work, so it being slower means the gate
  // is not where it claims to be — reading stdin first, say. Tolerance covers
  // sampling noise between two runs of a ~24ms process, not a real regression.
  if (inertP99 > recordingP99 + TOLERANCE_MS) {
    console.error(
      `mm-log bench: inert p99 ${inertP99.toFixed(2)}ms is worse than recording ${recordingP99.toFixed(2)}ms`,
    );
    failed = true;
  }

  if (failed) process.exit(1);
}

main();
