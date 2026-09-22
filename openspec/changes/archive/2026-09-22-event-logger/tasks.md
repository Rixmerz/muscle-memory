## 1. Core: event types and paths

- [x] 1.1 `packages/mm-core/src/events.ts` — `HookPayload` (the shape Claude Code sends) and `MMEvent` (the shape written), with `v: 1`
- [x] 1.2 `packages/mm-core/src/paths.ts` — `eventFileFor(date, root)` returning `<root>/.mm/events/YYYY-MM-DD.ndjson`, UTC
- [x] 1.3 Tests for `paths.ts` covering the UTC boundary (23:59 and 00:01)

## 2. Core: signature and argument hash

- [x] 2.1 `packages/mm-core/src/signature.ts` — `toolSignature(toolName, toolInput)`
- [x] 2.2 Bash discriminator: first two argv-ish tokens, flags and their values dropped
- [x] 2.3 File tools discriminator: extension only, never a path segment
- [x] 2.4 Scrubber: token shapes, URLs, `--key=value` values, then the `^[a-z0-9:._-]+$` constraint applied last as a hard filter
- [x] 2.5 `argHash(toolInput)` — sorted-key canonical JSON, SHA-256, first 12 hex
- [x] 2.6 Tests: every scenario in `specs/tool-signature/spec.md`, including the three adversarial leak cases
- [x] 2.7 Export all of the above from `packages/mm-core/src/index.ts`

## 3. Logger: the hook binary

- [x] 3.1 `packages/mm-logger/src/append.ts` — `appendRecord(record, root)`, `O_APPEND`, truncating to 4000 bytes with `trunc: true`
- [x] 3.2 `packages/mm-logger/src/bin.ts` — read stdin, build the record, append, exit 0; whole body in one try/catch
- [x] 3.3 `PostToolUse` branch: derive `ok` and `dur_ms` from `tool_response`
- [x] 3.4 Wire the `mm-log` bin in `packages/mm-logger/package.json` and add the shebang
- [x] 3.5 Tests: one record per invocation, malformed stdin, empty stdin, unwritable dir, unknown tool
- [x] 3.6 Concurrency test: 50 parallel invocations produce 50 parseable lines

## 4. Backfill

- [x] 4.1 `packages/mm-logger/src/backfill.ts` — locate `~/.claude/projects/<slug>/*.jsonl` for a given repo root
- [x] 4.2 Map transcript entries to `MMEvent`, partitioned by the original event date
- [x] 4.3 Write each day file under a temp name and rename, so a re-run converges instead of appending
- [x] 4.4 Tests: idempotence over a fixture transcript, and correct date partitioning

## 5. Benchmark

- [x] 5.1 `packages/mm-logger/src/bench.ts` — 200 sequential invocations, reporting p50/p95/p99
- [x] 5.2 Exit non-zero when p99 exceeds 30 ms
- [x] 5.3 Run it and record the actual numbers in the commit message

## 6. Close out

- [x] 6.1 `pnpm build && pnpm test && pnpm lint && pnpm typecheck` all green
- [x] 6.2 `.mm/` confirmed gitignored and no event file staged
- [x] 6.3 README updated with what the logger records and what it never records
