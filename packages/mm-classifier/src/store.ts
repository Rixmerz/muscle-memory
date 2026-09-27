/**
 * Where classifier definitions live. The storage choice is always explicit:
 * `.mm/classifiers/` is local and gitignored, `--out` can be a committed
 * path, and the user is the one who knows which they want.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { MM_DIR } from "@muscle-memory/core";
import { validate, type Definition } from "./definition.js";

export interface StoreChoice {
  store?: string | undefined;
  out?: string | undefined;
  force?: boolean;
}

export function classifiersDir(root: string): string {
  return join(root, MM_DIR, "classifiers");
}

export const STORAGE_QUESTION =
  "choose where to store it: --store mm (.mm/classifiers/, local to this machine, gitignored) " +
  "or --out <path> (any path, e.g. one you commit). Ask the user which they want.";

/** Absolute file a `new` call writes to, or throws saying what is missing. */
export function targetPath(root: string, name: string, choice: StoreChoice): string {
  if ((choice.store === undefined) === (choice.out === undefined)) {
    throw new Error(`exactly one storage option is required: ${STORAGE_QUESTION}`);
  }
  if (choice.store !== undefined) {
    if (choice.store !== "mm") throw new Error(`--store accepts only "mm"; for anything else use --out <path>`);
    // `.mm/` is the recording consent; creating it here would switch the
    // event logger on as a side effect of saving a classifier.
    if (!existsSync(join(root, MM_DIR))) {
      throw new Error(
        `${MM_DIR}/ does not exist here. Run /mm:enable first (it also turns on event recording), or use --out <path>.`,
      );
    }
    return join(classifiersDir(root), `${name}.json`);
  }
  const out = resolve(root, choice.out!);
  return out.endsWith(".json") ? out : join(out, `${name}.json`);
}

export function writeDefinition(path: string, definition: Definition, force: boolean): void {
  if (existsSync(path) && !force) throw new Error(`${path} already exists; pass --force to overwrite`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(definition, null, 2)}\n`);
}

/** A path when it looks like one (`/` or `.json`), else a name under `.mm/classifiers/`. */
export function resolveRef(root: string, ref: string): string {
  if (ref.includes("/") || ref.endsWith(".json")) return resolve(root, ref);
  return join(classifiersDir(root), `${ref}.json`);
}

export function loadDefinition(path: string): Definition {
  if (!existsSync(path)) throw new Error(`no classifier at ${path}`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${path}: not valid JSON`);
  }
  try {
    return validate(raw);
  } catch (err) {
    throw new Error(`${path}: ${(err as Error).message}`);
  }
}

export type ListEntry =
  | { ok: true; path: string; name: string; description: string }
  | { ok: false; path: string; error: string };

export function list(root: string): ListEntry[] {
  const dir = classifiersDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file): ListEntry => {
      const path = join(dir, file);
      try {
        const { name, description } = loadDefinition(path);
        return { ok: true, path, name, description };
      } catch (err) {
        return { ok: false, path, error: (err as Error).message };
      }
    });
}
