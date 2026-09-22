import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { projectSlug, runBackfill, transcriptDir } from "./backfill.js";

let claudeHome: string;
let root: string;

beforeEach(() => {
  claudeHome = mkdtempSync(join(tmpdir(), "mm-logger-claude-home-"));
  root = mkdtempSync(join(tmpdir(), "mm-logger-repo-"));
});

afterEach(() => {
  rmSync(claudeHome, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
});

/** Three days ago, at a fixed time, so the fixture does not straddle a UTC boundary by accident. */
function threeDaysAgo(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 3);
  d.setUTCHours(10, 0, 0, 0);
  return d.toISOString();
}

function writeFixtureTranscript(toolUseTs: string, toolResultTs: string): void {
  const dir = transcriptDir(root, claudeHome);
  mkdirSync(dir, { recursive: true });

  const lines = [
    JSON.stringify({
      timestamp: toolUseTs,
      sessionId: "sess-1",
      cwd: root,
      message: {
        content: [
          { type: "tool_use", id: "tu_1", name: "Bash", input: { command: "pnpm test" } },
        ],
      },
    }),
    JSON.stringify({
      timestamp: toolResultTs,
      sessionId: "sess-1",
      cwd: root,
      message: {
        content: [{ type: "tool_result", tool_use_id: "tu_1", is_error: false }],
      },
    }),
  ];

  writeFileSync(join(dir, "session-1.jsonl"), `${lines.join("\n")}\n`);
}

function eventLineCount(): number {
  const dir = join(root, ".mm", "events");
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".ndjson"))
      .reduce((total, f) => total + readFileSync(join(dir, f), "utf8").trim().split("\n").length, 0);
  } catch {
    return 0;
  }
}

describe("backfill", () => {
  it("computes the transcript slug by replacing every / with -", () => {
    expect(projectSlug("/Users/jp/my/muscle-memory")).toBe("-Users-jp-my-muscle-memory");
  });

  it("is a no-op when there is no transcript directory for the repo", () => {
    expect(runBackfill(root, claudeHome)).toBe(0);
  });

  it("writes records to the day file for the original event date, not today", () => {
    const ts = threeDaysAgo();
    writeFixtureTranscript(ts, ts);

    runBackfill(root, claudeHome);

    const day = ts.slice(0, 10);
    const path = join(root, ".mm", "events", `${day}.ndjson`);
    const lines = readFileSync(path, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2); // one PreToolUse, one PostToolUse

    const today = new Date().toISOString().slice(0, 10);
    expect(day).not.toBe(today);

    const [pre, post] = lines.map((l) => JSON.parse(l));
    expect(pre.event).toBe("PreToolUse");
    expect(pre.tool).toBe("Bash");
    expect(post.event).toBe("PostToolUse");
    expect(post.ok).toBe(true);
  });

  it("is idempotent: a second run over the same transcripts leaves the total line count unchanged", () => {
    const ts = threeDaysAgo();
    writeFixtureTranscript(ts, ts);

    runBackfill(root, claudeHome);
    const first = eventLineCount();

    runBackfill(root, claudeHome);
    const second = eventLineCount();

    expect(second).toBe(first);
    expect(first).toBe(2);
  });
});
