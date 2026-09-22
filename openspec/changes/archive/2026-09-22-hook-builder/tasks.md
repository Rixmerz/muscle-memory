## 1. Package scaffold
- [x] 1.1 Create `packages/mm-builder` shaped like `packages/mm-learner`
      (`package.json`, `tsconfig.build.json`, workspace dep on
      `@muscle-memory/core`, `bin: {"mm-build": "./dist/bin.js"}`)
- [x] 1.2 Add it to the pnpm workspace / root `tsconfig` references list
      wherever `mm-learner` is listed

## 2. Proposal parsing
- [x] 2.1 `src/proposal-parser.ts`: `parseProposal(markdown): ParsedProposal`
      per `design.md` § Parsing a proposal
- [x] 2.2 Unit tests: valid hook proposal, valid slash-command proposal,
      malformed file (spec.md "file is not a proposal")

## 3. Hook building
- [x] 3.1 `src/hook.ts`: `buildHook(steps, command): HookFragment` per
      `design.md` § Validating the human's command, using
      `toolSignature` from `@muscle-memory/core`
- [x] 3.2 Unit tests: single-step match, single-step mismatch, multi-step
      input rejected

## 4. CLI
- [x] 4.1 `src/bin.ts`: `mm build <file> --command "<cmd>" [--write]` per
      `design.md` § CLI — every exit-1 path in spec.md's scenarios
- [x] 4.2 `--write` creates `.mm/hooks/` (not gitignored) and writes the
      fragment; confirm `.gitignore` only covers `.mm/events/`
- [x] 4.3 Integration test asserting `.claude/settings.json` is untouched
      before and after a run (spec.md "no settings.json write ever happens")

## 5. Validate
- [x] 5.1 `pnpm build && pnpm test && pnpm lint && pnpm typecheck` green
- [x] 5.2 `openspec validate hook-builder --strict` passes
