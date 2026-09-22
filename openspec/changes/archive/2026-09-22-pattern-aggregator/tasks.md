## 1. Package scaffold

- [x] 1.1 `packages/mm-aggregator/package.json` — `@muscle-memory/aggregator`, workspace dep on `@muscle-memory/core`, `bin: {"mm-candidates": "./dist/bin.js"}`
- [x] 1.2 `packages/mm-aggregator/tsconfig.build.json`, add reference to root `tsconfig.json`
- [x] 1.3 Add the package to the pnpm workspace (already covered by `packages/*` glob — verify)

## 2. Reading and grouping

- [x] 2.1 `src/ndjson.ts` — `readEvents(root): MMEvent[]`, reads every `.mm/events/*.ndjson`, skips malformed lines
- [x] 2.2 `src/sequences.ts` — `groupSessions(events)`: per-session, `ts`-ordered arrays
- [x] 2.3 Test: two interleaved sessions in one day file group into two independent ordered sequences
- [x] 2.4 Test: malformed NDJSON lines are skipped, not fatal

## 3. Mining

- [x] 3.1 `mineNgrams(sessions, {minLen: 2, maxLen: 4})` — contiguous windows, never crossing a session boundary
- [x] 3.2 Test: a session shorter than `minLen` yields no pattern
- [x] 3.3 Test: a window never spans two sessions (spec scenario)

## 4. Scoring

- [x] 4.1 `src/score.ts` — implement all six factors and the penalty exactly as in `design.md`
- [x] 4.2 Match each step's `PostToolUse.ok` by session + adjacent `sig`; unmatched steps count as successful
- [x] 4.3 Test: single-occurrence pattern (spec scenario: low frequency/consistency, `variabilidad = 0`)
- [x] 4.4 Test: every occurrence has a failing step → `exito = 0`, `score = 0`
- [x] 4.5 Test: identical `arg` hash across occurrences → `determinismo = 1`
- [x] 4.6 Test: score is clamped to `[0, 1]`

## 5. CLI

- [x] 5.1 `src/candidates.ts` — pipeline: read → group → mine → score → filter `score >= minScore` → sort descending
- [x] 5.2 `src/bin.ts` — `mm candidates [--min-score 0.8] [--json]`, exits 0
- [x] 5.3 Test: no `.mm/` → exit 0, no output
- [x] 5.4 Test: below-threshold pattern omitted from output (spec scenario)
- [x] 5.5 Test: `--json` emits an array with `steps`, `score`, `occurrences`, `sessions` per candidate

## 6. Close out

- [x] 6.1 `pnpm build && pnpm test && pnpm lint && pnpm typecheck` all green
- [x] 6.2 `openspec validate --all --strict` green
- [x] 6.3 README: add `mm candidates` to the M2 status line
