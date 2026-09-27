import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { evaluate, MAX_DEPTH, resolveNext } from "./flow.js";
import { DEAD_URL, startStub, type Stub } from "./stub-server.fixture.js";

let stub: Stub;
let dir: string;
beforeAll(async () => {
  stub = await startStub();
});
afterAll(() => stub.close());
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mm-classifier-flow-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function write(name: string, labels: string[], extra: Record<string, unknown> = {}, decide: Record<string, unknown> = {}): string {
  const criteria = Object.fromEntries(labels.map((l) => [l, l]));
  const path = join(dir, `${name}.json`);
  writeFileSync(
    path,
    JSON.stringify({
      name,
      description: "",
      questions: { q: { type: "choice", instructions: "Which?", criteria } },
      decide: { question: "q", fallback: `${name}-fallback`, ...decide },
      ...extra,
    }),
  );
  return path;
}

describe("evaluate", () => {
  it("follows rules down a chain without calling Laya", async () => {
    const root = write("sender", ["banco", "otro"], { rules: [{ match: { email: "bancochile" }, label: "banco" }] }, { next: { banco: "bank-name" } });
    write("bank-name", ["bancochile", "falabella"], { rules: [{ match: { email: "bancochile" }, label: "bancochile" }] }, { routes: { bancochile: "file" } });
    const d = await evaluate(root, { email: "x@bancochile.cl" }, { url: DEAD_URL });
    expect(d).toMatchObject({ label: "banco", reason: "rule", outcome: "file" });
    expect(d.next).toMatchObject({ classifier: "bank-name", label: "bancochile", outcome: "file" });
  });

  it("falls through to Laya when no rule hits and chains on its label", async () => {
    const root = write("sender", ["safe", "destructive"], { rules: [{ match: { email: "never" }, label: "safe" }] }, { next: { destructive: "sub/kind.json" } });
    const sub = join(dir, "sub");
    mkdirSync(sub);
    writeFileSync(join(sub, "kind.json"), JSON.stringify({ name: "kind", description: "", questions: { q: { type: "choice", instructions: "?", criteria: { safe: "", destructive: "" } } }, decide: { question: "q", routes: { destructive: "deny" }, fallback: "x" } }));
    const d = await evaluate(root, { command: "rm -rf" }, { url: stub.url });
    expect(d).toMatchObject({ reason: "unrouted", label: "destructive", outcome: "deny" });
    expect(d.next?.classifier).toBe("kind");
  });

  it("does not follow next with follow:false or on low confidence", async () => {
    const root = write("a", ["safe", "destructive"], {}, { next: { safe: "b" }, minConfidence: 0.95 });
    write("b", ["x", "y"], { rules: [{ match: { command: "" }, label: "x" }] });
    const low = await evaluate(root, { command: "ls" }, { url: stub.url });
    expect(low).toMatchObject({ reason: "low-confidence", outcome: "a-fallback" });
    expect(low.next).toBeUndefined();
    const root2 = write("c", ["safe", "destructive"], {}, { next: { safe: "b" } });
    expect((await evaluate(root2, { command: "ls" }, { url: stub.url, follow: false })).next).toBeUndefined();
  });

  it("rejects a cycle and a chain deeper than the limit", async () => {
    const a = write("a", ["x", "y"], { rules: [{ match: { k: "" }, label: "x" }] }, { next: { x: "b" } });
    write("b", ["x", "y"], { rules: [{ match: { k: "" }, label: "x" }] }, { next: { x: "a" } });
    await expect(evaluate(a, {}, { url: DEAD_URL })).rejects.toThrow(/cycle: .*a\.json -> .*b\.json -> .*a\.json/);
    for (let i = 0; i <= MAX_DEPTH; i++) {
      write(`d${i}`, ["x", "y"], { rules: [{ match: { k: "" }, label: "x" }] }, { next: { x: `d${i + 1}` } });
    }
    await expect(evaluate(join(dir, "d0.json"), {}, { url: DEAD_URL })).rejects.toThrow(/deeper than 5/);
  });
});

describe("resolveNext", () => {
  it("resolves names as siblings and paths relative to the definition", () => {
    expect(resolveNext("/c/root.json", "bank")).toBe("/c/bank.json");
    expect(resolveNext("/c/root.json", "../x/y.json")).toBe("/x/y.json");
  });
});
