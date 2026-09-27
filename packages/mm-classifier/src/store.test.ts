import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Definition } from "./definition.js";
import { list, loadDefinition, resolveRef, targetPath, writeDefinition } from "./store.js";

const DEF: Definition = {
  name: "bash-risk",
  description: "risk",
  questions: { r: { type: "choice", instructions: "Risk?", criteria: { a: "", b: "" } } },
  decide: { question: "r", fallback: "continue" },
};

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "mm-classifier-store-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("targetPath", () => {
  it("refuses without a storage choice and names both options", () => {
    expect(() => targetPath(root, "x", {})).toThrow(/--store mm.*--out <path>/s);
  });

  it("refuses both choices at once", () => {
    mkdirSync(join(root, ".mm"));
    expect(() => targetPath(root, "x", { store: "mm", out: "a" })).toThrow(/exactly one/);
  });

  it("refuses --store mm before .mm/ exists and does not create it", () => {
    expect(() => targetPath(root, "x", { store: "mm" })).toThrow(/\/mm:enable/);
    expect(existsSync(join(root, ".mm"))).toBe(false);
  });

  it("rejects --store values other than mm", () => {
    mkdirSync(join(root, ".mm"));
    expect(() => targetPath(root, "x", { store: "home" })).toThrow(/only "mm"/);
  });

  it("stores into .mm/classifiers/", () => {
    mkdirSync(join(root, ".mm"));
    expect(targetPath(root, "x", { store: "mm" })).toBe(join(root, ".mm", "classifiers", "x.json"));
  });

  it("treats --out as a file when it ends in .json, else a directory", () => {
    expect(targetPath(root, "x", { out: "c/y.json" })).toBe(join(root, "c", "y.json"));
    expect(targetPath(root, "x", { out: "c" })).toBe(join(root, "c", "x.json"));
  });
});

describe("writeDefinition", () => {
  it("refuses to overwrite without force", () => {
    const path = join(root, "c", "x.json");
    writeDefinition(path, DEF, false);
    expect(() => writeDefinition(path, { ...DEF, description: "new" }, false)).toThrow(/--force/);
    expect(JSON.parse(readFileSync(path, "utf8")).description).toBe("risk");
    writeDefinition(path, { ...DEF, description: "new" }, true);
    expect(JSON.parse(readFileSync(path, "utf8")).description).toBe("new");
  });
});

describe("resolveRef and list", () => {
  it("resolves names into .mm/classifiers/ and paths as given", () => {
    expect(resolveRef(root, "x")).toBe(join(root, ".mm", "classifiers", "x.json"));
    expect(resolveRef(root, "./c/x.json")).toBe(join(root, "c", "x.json"));
    expect(resolveRef(root, "x.json")).toBe(join(root, "x.json"));
  });

  it("lists valid definitions and reports invalid ones", () => {
    const dir = join(root, ".mm", "classifiers");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "a.json"), JSON.stringify({ ...DEF, name: "a" }));
    writeFileSync(join(dir, "b.json"), "{not json");
    const entries = list(root);
    expect(entries[0]).toMatchObject({ ok: true, name: "a" });
    expect(entries[1]).toMatchObject({ ok: false });
  });

  it("returns nothing when there is no classifiers directory", () => {
    expect(list(root)).toEqual([]);
  });

  it("names the file when loading an invalid definition", () => {
    const path = join(root, "bad.json");
    writeFileSync(path, JSON.stringify({ ...DEF, decide: { question: "zz", fallback: "x" } }));
    expect(() => loadDefinition(path)).toThrow(/bad\.json: decide\.question/);
    expect(() => loadDefinition(join(root, "none.json"))).toThrow(/no classifier/);
  });
});
