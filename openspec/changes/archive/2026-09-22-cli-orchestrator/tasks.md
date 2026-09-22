## 1. Package scaffold
- [x] 1.1 Create `packages/mm-cli` shaped like `packages/mm-learner`
      (`package.json`, `tsconfig.build.json`, workspace deps on
      `@muscle-memory/aggregator`, `@muscle-memory/learner`,
      `@muscle-memory/builder`, `@muscle-memory/installer`,
      `@muscle-memory/core`, `bin: {"mm": "./dist/bin.js"}`)
- [x] 1.2 Add it to the pnpm workspace / root `tsconfig` references list
      wherever `mm-learner` is listed

## 2. CLI dispatch
- [x] 2.1 `src/bin.ts`: flag parsing (`--min-score`, `--build <n>`,
      `--command`, `--install`) per `design.md` § `src/bin.ts` dispatch
- [x] 2.2 No-flags path: mine via `candidates()`, print each via
      `formatProposal`, prefixed `[i]`, exit 0, no writes
- [x] 2.3 `--build <n>` path: bounds check, slash-command rejection
      (verbatim message), missing-`--command` rejection (verbatim message),
      `buildHook()` call, print fragment JSON, exit 0, no writes
- [x] 2.4 `--install` path: `--install` without `--build` rejected;
      otherwise `deriveId` → ensure `.mm/hooks/guard.mjs` → `readSettings` →
      `installEntry` → `writeSettings` → write `<id>.install.json` → print
      id, exit 0

## 3. Tests
- [x] 3.1 Unit tests for flag parsing (bounds, missing `--command`,
      `--install` without `--build`)
- [x] 3.2 Integration test: no-flag run prints proposals, `.mm/` and
      `.claude/settings.json` untouched
- [x] 3.3 Integration test: `--build --command` prints fragment,
      `.claude/settings.json` untouched
- [x] 3.4 Integration test: `--build --command --install` writes
      `.claude/settings.json` entry and `.mm/hooks/<id>.install.json`
- [x] 3.5 Integration test: slash-command-target candidate fails with the
      exact rejection message

## 4. Validate
- [x] 4.1 `pnpm build && pnpm test && pnpm lint && pnpm typecheck` green
- [x] 4.2 `openspec validate cli-orchestrator --strict` passes

## 5. Docs
- [x] 5.1 Update README's "Status" section (M6) and "Packages" table to
      include `mm-cli`, `mm-builder`, `mm-installer`
