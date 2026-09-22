## 1. Package scaffold
- [x] 1.1 Create `packages/mm-installer` shaped like `packages/mm-builder`
      (`package.json`, `tsconfig.build.json`, workspace dep on
      `@muscle-memory/core`, `bin: {"mm-install": "./dist/bin.js"}`)
- [x] 1.2 Add it to the pnpm workspace / root `tsconfig` references list
      wherever `mm-builder` is listed

## 2. Settings merge
- [x] 2.1 `src/settings.ts`: `readSettings`, `installEntry`, `removeEntry`,
      `writeSettings` per `design.md` § Merging into .claude/settings.json
- [x] 2.2 Unit tests: first install on existing file, idempotent
      re-install, remove present/absent entry, other keys preserved

## 3. Guard
- [x] 3.1 `src/guard.ts`: id derivation (`deriveId`), guard.mjs source
      constant, guard state read/write per `design.md` § Deriving the id
      and § The guard
- [x] 3.2 Unit tests: id stability across re-install, id distinctness for
      differing commands sharing a signature, failure counter increments
      and resets, self-demotion at 3 consecutive failures

## 4. CLI
- [x] 4.1 `src/bin.ts`: `mm install <fragment-file> [--settings <path>]`
      and `mm uninstall <id> [--settings <path>]` per `design.md` § CLI
- [x] 4.2 Integration test: install writes `guard.mjs` once and does not
      overwrite it on a second install
- [x] 4.3 Integration test: invalid fragment shape exits non-zero and
      writes nothing (settings.json and `.mm/hooks/` both untouched)
- [x] 4.4 Integration test: end-to-end guard run via `child_process` —
      a failing command demoted after 3 consecutive runs, entry removed
      from `.claude/settings.json`

## 5. Validate
- [x] 5.1 `pnpm build && pnpm test && pnpm lint && pnpm typecheck` green
- [x] 5.2 `openspec validate hook-installer --strict` passes
