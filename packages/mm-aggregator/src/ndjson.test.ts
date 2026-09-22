import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readEvents } from "./ndjson.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "mm-aggregator-ndjson-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function line(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    v: 1,
    ts: "2026-09-20T10:00:00.000Z",
    session: "s1",
    cwd: root,
    event: "PreToolUse",
    tool: "Bash",
    sig: "bash:pnpm-test",
    arg: "aaaaaaaaaaaa",
    ...overrides,
  });
}

describe("readEvents", () => {
  it("returns [] when .mm/events/ does not exist", () => {
    expect(readEvents(root)).toEqual([]);
  });

  it("reads every .ndjson file under .mm/events/", () => {
    const dir = join(root, ".mm", "events");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "2026-09-20.ndjson"), `${line()}\n`);
    writeFileSync(join(dir, "2026-09-21.ndjson"), `${line({ ts: "2026-09-21T10:00:00.000Z" })}\n`);

    const events = readEvents(root);
    expect(events).toHaveLength(2);
  });

  it("skips malformed lines without failing the read", () => {
    const dir = join(root, ".mm", "events");
    mkdirSync(dir, { recursive: true });
    const body = [line(), "not json", '{"incomplete":', line({ session: "s2" })].join("\n");
    writeFileSync(join(dir, "2026-09-20.ndjson"), `${body}\n`);

    const events = readEvents(root);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.session)).toEqual(["s1", "s2"]);
  });
});
