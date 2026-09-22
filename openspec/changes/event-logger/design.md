## Context

The logger runs inside a `PreToolUse`/`PostToolUse` hook, once per tool call,
as a spawned process. Three hooks already run on the `*` matcher on this
machine. The whole hook chain should stay under ~100 ms or the user feels it,
so 30 ms is this component's share and it is mostly Node's startup.

## Decisions

**One process, no dependencies, synchronous I/O.** `bin.ts` imports only Node
builtins and, from `@muscle-memory/core`, pure functions. Reading stdin is
`readFileSync(0)`. Appending is `appendFileSync(path, line, {flag: "a"})`.
Async would add an event-loop turn to buy concurrency this process does not
need — it writes one line and exits.

*Alternative rejected:* a long-lived daemon with a unix socket. Faster per call,
but it adds a process to supervise, a socket to clean up, and a failure mode
where the daemon is dead and the hook silently records nothing. Revisit only if
the benchmark proves cold start cannot meet 30 ms.

**`O_APPEND` is the concurrency story.** Writes under `PIPE_BUF` (4096 on
macOS, 4096 on Linux) to a file opened `O_APPEND` are atomic, so concurrent
hook processes cannot interleave lines. This bounds the record: a record whose
serialisation exceeds 4000 bytes is truncated — its `sig` and timestamps are
kept, its variable-length fields are dropped, and a `trunc: true` flag is set.
Without the bound the guarantee quietly stops holding at a size nobody tests.

*Alternative rejected:* a lock file. Adds a syscall round trip and a stale-lock
failure mode to a path whose budget is 30 ms.

**The signature is computed in the hot path, not at mining time.** It costs a
regex pass and buys two things: the raw command never reaches disk (privacy),
and the aggregator reads a file it does not have to re-normalise (speed). The
argument hash preserves what the signature throws away, one-way.

**Day-partitioned files, UTC.** `.mm/events/YYYY-MM-DD.ndjson`. No rotation
logic, no index, no SQLite yet — the aggregator (M2) owns the database, and
building one before there is anything to query is the wrong order. Backfill
partitions by the *original* event date, which is also what makes it
idempotent: a day file is rewritten from scratch under a temp name and renamed,
so replaying the same transcripts converges instead of appending.

**Failure is silence, always.** Every path in `main()` is inside one
`try/catch` whose handler is `process.exit(0)`. A logger that breaks a tool
call is worse than a logger that loses an event, and it is not close: the data
is for a pattern miner that needs hundreds of samples, so a dropped record
costs nothing measurable.

## Risks

- **Node cold start may eat the whole budget.** ~25-40 ms is typical for
  `node` on a warm cache. The benchmark exists to find this out early and fail
  loudly. If it fails: either the budget moves (amend the requirement) or the
  binary is rewritten as a compiled shim. Both are decisions to take with a
  number in hand, which is why the benchmark lands in this change and not a
  later one.
- **The signature normaliser is where privacy leaks would live.** Its tests are
  adversarial by design — token shapes, flag values, URLs — and they are part
  of the spec, not the implementation.
- **`.mm/` grows unbounded.** Acceptable at M1 (one line per tool call is on
  the order of a megabyte a month). Retention belongs to M2, where the
  aggregator knows what it has already consumed.
