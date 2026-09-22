## 1. Package scaffold

- [x] 1.1 Create `packages/mm-learner/package.json` — `@muscle-memory/learner`,
      workspace dep on `@muscle-memory/aggregator`,
      `bin: {"mm-propose": "./dist/bin.js"}`, mirrors `mm-aggregator`'s shape.
- [x] 1.2 Create `packages/mm-learner/tsconfig.build.json` and
      `packages/mm-learner/tsconfig.json` (test-inclusive, `noEmit`, mirrors
      `mm-aggregator`).
- [x] 1.3 Add `packages/mm-learner/tsconfig.build.json` to the root
      `tsconfig.json` `references` array.
- [x] 1.4 Create `packages/mm-learner/src/index.ts` stub, matching the
      barrel convention of `mm-aggregator`/`mm-logger`.

## 2. Classification and rendering

- [x] 2.1 Implement `src/proposal.ts`: `formatProposal(candidate: ScoredPattern): Proposal`
      with the single-bash-signature heuristic from design.md.
- [x] 2.2 Unit test: all-identical `bash:*` steps → `target: "hook"`.
- [x] 2.3 Unit test: mixed or non-bash steps → `target: "slash-command"`.
- [x] 2.4 Unit test: rendered markdown contains all six factor names and
      values from the candidate's score breakdown.

## 3. CLI

- [x] 3.1 Implement `src/bin.ts`: `mm propose [--min-score 0.8] [--write]`,
      calling `@muscle-memory/aggregator`'s `candidates()` directly.
- [x] 3.2 Test: no `.mm/` directory → exit 0, no output.
- [x] 3.3 Test: candidate below `--min-score` → omitted from output.
- [x] 3.4 Test: `--write` creates `.mm/proposals/<date>-<slug>.md`.
- [x] 3.5 Test: `mm propose` (no `--write`) and `mm propose --write` leave
      `plugin/` and every `.claude/settings.json` untouched.

## 4. Docs

- [x] 4.1 Update root `README.md`: M3 status line, `@muscle-memory/learner`
      row in the packages table.
