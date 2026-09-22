import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EVENT_SCHEMA_VERSION, type MMEvent } from "@muscle-memory/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendRecord } from "./append.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "mm-logger-append-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function baseRecord(overrides: Partial<MMEvent> = {}): MMEvent {
  return {
    v: EVENT_SCHEMA_VERSION,
    ts: "2026-09-22T12:00:00.000Z",
    session: "s1",
    cwd: root,
    event: "PreToolUse",
    tool: "Bash",
    sig: "bash:pnpm:test",
    arg: "0123456789ab",
    ...overrides,
  };
}

function dayFileLines(): string[] {
  const path = join(root, ".mm", "events", "2026-09-22.ndjson");
  return readFileSync(path, "utf8").trim().split("\n");
}

describe("appendRecord", () => {
  it("creates the events directory and appends one line", () => {
    appendRecord(baseRecord(), root);

    const lines = dayFileLines();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ tool: "Bash", event: "PreToolUse" });
  });

  it("appends a second call on a new line without disturbing the first", () => {
    appendRecord(baseRecord({ tool: "Bash" }), root);
    appendRecord(baseRecord({ tool: "Read" }), root);

    const lines = dayFileLines();
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).tool).toBe("Bash");
    expect(JSON.parse(lines[1]!).tool).toBe("Read");
  });

  it("truncates a record whose serialisation exceeds 4000 bytes", () => {
    const huge = "x".repeat(5000);
    appendRecord(baseRecord({ cwd: huge }), root);

    const lines = dayFileLines();
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]!) as MMEvent;
    expect(record.trunc).toBe(true);
  });

  it("keeps only v, ts, session, cwd, event, tool, sig, arg, trunc when truncated, dropping ok/dur_ms", () => {
    const huge = "x".repeat(5000);
    appendRecord(baseRecord({ session: huge, event: "PostToolUse", ok: true, dur_ms: 12 }), root);

    const lines = dayFileLines();
    const record = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(Object.keys(record).sort()).toEqual(
      ["arg", "cwd", "event", "sig", "session", "tool", "trunc", "ts", "v"].sort(),
    );
    expect(record["ok"]).toBeUndefined();
    expect(record["dur_ms"]).toBeUndefined();
  });

  it("does not truncate a record within the bound", () => {
    appendRecord(baseRecord(), root);

    const lines = dayFileLines();
    const record = JSON.parse(lines[0]!) as MMEvent;
    expect(record.trunc).toBeUndefined();
  });
});
