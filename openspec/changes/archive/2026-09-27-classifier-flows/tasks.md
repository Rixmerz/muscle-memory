## 1. Package scaffold

- [x] 1.1 Create `packages/mm-classifier` (package.json with bin `mm-classifier`, tsconfig.json, tsconfig.build.json) and add it to the root `tsconfig.json` references; verify `pnpm build` succeeds

## 2. Core

- [x] 2.1 `definition.ts`: types, `validate()` and label sets per question type; verify unit tests cover each rejection in the spec
- [x] 2.2 `decide.ts`: input mapping and the label/confidence/outcome derivation for `choice`, `score` and `noul`; verify unit tests cover `routed`, `unrouted`, `low-confidence` and the noul threshold
- [x] 2.3 `store.ts`: `--store mm` / `--out` resolution, the `.mm/` consent check, `--force`, name-or-path resolution and `list`; verify tests on temp directories
- [x] 2.4 `laya.ts`: `predict()` and `health()` over `fetch` with a timeout, and an unreachable-server error distinct from HTTP errors; verify tests against a local `node:http` stub server
- [x] 2.5 `hook.ts`: decision → hook output for `PreToolUse` and other events; verify tests for each outcome and the fail-open paths
- [x] 2.7 `setup.ts`: venv (uv or python3 ≥ 3.10), CPU torch, `laya[serve]`, import check, checkpoint download, idempotent; verify tests with a fake runner cover each branch and a failed step
- [x] 2.8 Rules: `rules` validation, `ruleLabel`/`decideByRule`, rule hits skip Laya; verify unit tests for AND-matching, order, missing fields and invalid rules
- [x] 2.9 `flow.ts`: `decide.next` chaining relative to the definition, low-confidence stop, cycle and depth limits, `test` not following; verify flow tests against the stub and a dead URL
- [x] 2.10 `lint.ts`: warnings for Laya's documented pitfalls, printed by `new` and `test`; verify lint tests for each warning and a silent canonical question
- [x] 2.11 `test` reports rule and Laya accuracy separately; choice accepts null glosses and label lists, noul accepts no criteria and validated `labels`; verify bin and definition tests
- [x] 2.6 `server.ts`: `start`/`stop`/`status` with pid and log files, 127.0.0.1 binding, CPU default and CUDA hiding; verify tests with a fake interpreter script

## 3. CLI and bundle

- [x] 3.1 `bin.ts`: dispatch `new`, `list`, `run`, `test`, `hook`, `hook-fragment`, `server`; verify end-to-end tests spawning the built bin against the stub server
- [x] 3.2 Add the `mm-classifier` esbuild entry to the root `bundle` script, commit `plugin/bin/mm-classifier.mjs`, and add a test that it imports only Node builtins and is byte-identical to a fresh build

## 4. Skill and docs

- [x] 4.1 Write `plugin/skills/classifier/SKILL.md` (environment check, Laya install into the per-user venv, author a definition, ask where to store it, `test`, wire into a hook or another flow, report); verify its frontmatter parses and every command it names exists in `bin.ts`
- [x] 4.3 `plugin/skills/classifier/references/laya.md`: Laya's input format, vendor ceilings, pitfalls with issue numbers, calibration and specialisation paths, with measurements; skill authoring section rewritten around it
- [x] 4.2 README section, CHANGELOG 0.9.0 entry, `plugin.json` version 0.9.0; verify versions agree

## 5. Verification

- [x] 5.1 `pnpm build && pnpm test && pnpm lint && pnpm typecheck` all green
- [x] 5.2 Live run against a real `laya-serve` on CPU: create a classifier with `--store mm` in a temp repo, `test` it, `run` it, and pipe a `PreToolUse` payload through `hook`; record the observed decisions and latency
