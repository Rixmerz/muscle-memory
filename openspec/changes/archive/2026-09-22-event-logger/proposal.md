## Why

muscle-memory compiles repeated agent behaviour into hooks, and it cannot mine
a pattern it never saw. Nothing in this repo observes anything yet. The logger
is the only component whose absence blocks every other milestone, and it is
also the only one that runs on the user's critical path — inside a `PreToolUse`
hook, before every tool call Claude Code makes — so its latency and its failure
behaviour are contract, not implementation detail.

`~/.claude/settings.json` on this machine already chains three hooks on the `*`
matcher. This is the fourth. A logger that adds 200 ms, or that exits non-zero
on a malformed payload, degrades the user's session in exchange for data that
nobody is mining yet.

## What Changes

- New hook binary `mm-log`, invoked with an event name, reading Claude Code's
  hook JSON on stdin and appending one record to a day-partitioned NDJSON file
  under `.mm/events/`.
- New event record schema, versioned (`v: 1`), carrying a normalised tool
  **signature** rather than the raw tool input.
- New signature normalisation in `@muscle-memory/core`: the function that turns
  `{tool_name, tool_input}` into a stable, low-cardinality string, plus an
  argument hash used later to measure determinism.
- New backfill command that replays existing transcripts from
  `~/.claude/projects/<slug>/*.jsonl` into the same NDJSON format, so the
  aggregator has history on day one instead of in two weeks.
- No hook is installed into `~/.claude/settings.json` by this change. Writing
  to the user's settings is a separate, approval-gated change.

## Capabilities

### New Capabilities

- `event-logging`: what the logger records, what it records it as, how fast it
  must be, and what it must do when anything goes wrong.
- `tool-signature`: how a raw tool invocation is reduced to a stable signature
  and an argument hash, including what must never appear in either.

### Modified Capabilities

None. This is the first behaviour in the repo.

## Impact

- `packages/mm-core` — gains `events.ts`, `signature.ts`, `paths.ts`. No
  runtime dependencies; Node builtins only.
- `packages/mm-logger` — gains `bin.ts` (the hook entrypoint), `append.ts`,
  `backfill.ts`, and a `mm-log` bin.
- `.mm/` — new, gitignored, per-repo. Holds `events/YYYY-MM-DD.ndjson`.
- No change to `~/.claude/settings.json`, and none to CI.
- Startup cost is the constraint that shapes the design: a Node process spawned
  per tool call. If cold start alone cannot meet the budget, the design records
  that and the budget is renegotiated in the open, not silently missed.
