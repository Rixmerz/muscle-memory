## 1. Plugin skeleton

- [x] 1.1 `plugin/.claude-plugin/plugin.json` — name, version, description, author, license, repository, keywords
- [x] 1.2 `plugin/hooks/hooks.json` — five events, `*` matcher, `${CLAUDE_PLUGIN_ROOT}`, 5 s timeout
- [x] 1.3 `.claude-plugin/marketplace.json` at the repo root — `git-subdir` source pointing at `plugin/`
- [x] 1.4 `plugin/commands/enable.md`, `status.md`, `backfill.md`
- [x] 1.5 `plugin/agents/` and `plugin/skills/` created empty, filled at M3

## 2. The opt-in gate

- [x] 2.1 `packages/mm-logger/src/bin.ts` — probe `.mm/` as the first statement, before stdin is read; exit 0 silently when absent
- [x] 2.2 Tests: no `.mm/` writes nothing, creates nothing, prints nothing on either stream
- [x] 2.3 Test: `.mm/` present records normally (guards against the probe being inverted)
- [x] 2.4 Benchmark the opted-out path and assert its p99 is no worse than the recording path

## 3. Bundle

- [x] 3.1 Add `esbuild` as a root devDependency
- [x] 3.2 Root `bundle` script — esbuild, `--bundle --format=esm --platform=node --target=node22`, out to `plugin/bin/mm-log.mjs`
- [x] 3.3 Run it; commit the bundle
- [x] 3.4 Test: the bundle's import graph resolves only to `node:` builtins
- [x] 3.5 Test: re-running the bundle leaves `git status --porcelain plugin/bin/mm-log.mjs` empty
- [x] 3.6 Smoke test: `node plugin/bin/mm-log.mjs PreToolUse` appends one record in a temp repo with `.mm/`

## 4. Manifest consistency

- [x] 4.1 Test: plugin manifest parses and has non-empty name, version, description
- [x] 4.2 Test: the marketplace entry's name matches the plugin manifest's name
- [x] 4.3 Test: every hook event name in `hooks.json` is a member of `HookEventName`
- [x] 4.4 Test: no hook command references an absolute path outside the plugin

## 5. Close out

- [x] 5.1 `pnpm build && pnpm test && pnpm lint && pnpm typecheck` all green
- [x] 5.2 README: install instructions via the marketplace, and the sentence that installing records nothing until `/mm:enable`
- [x] 5.3 Install the plugin locally from the clone and confirm the five hooks appear and stay inert in a repo without `.mm/`
