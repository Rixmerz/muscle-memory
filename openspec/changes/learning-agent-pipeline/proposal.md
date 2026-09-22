# Proposal: learning-agent-pipeline

## Why

M1-M6 built the whole pipeline as CLIs a human chains by hand: `mm candidates`
scores, `mm propose` explains, `mm build` compiles, `mm-install` installs, `mm
run` chains the four. Nothing watches `.mm/events/` and nothing evaluates a
candidate before a human reads its markdown proposal — the aggregator's score
is a ranking signal, not a judgment. Two things are still missing before "a
pattern repeated" can safely become "a hook exists":

1. **Detection is manual.** A user has to remember to run `mm run` to find out
   a pattern has cleared the score gate. Nothing tells them.
2. **Nothing evaluates a candidate beyond its numeric score.** The score
   engine (`@muscle-memory/aggregator`) answers "how often, how consistently,
   how deterministically" — it cannot answer "is this actually safe to
   automate", "is `PostToolUse` the right lifecycle point", or "is this the
   pattern, or the pattern's cause" (e.g. a flaky test retried twice is not a
   hook candidate; a formatter run after every edit is).

Auto-demotion already exists (`packages/mm-installer/src/guard.ts`:
`FAILURE_THRESHOLD = 3` self-uninstalls a hook after three consecutive
non-zero exits) — this milestone does not touch it. What is missing is
upstream of install: judgment, and a nudge to look.

## What

Add a **learning agent** — a Claude Code subagent shipped by this plugin
(`plugin/agents/learning-agent.md`) — that a new `/mm:review` command
dispatches once per candidate that clears the score gate. The agent reads the
candidate's evidence (steps, occurrences, score breakdown, example event
records) and returns a structured verdict: `recommend` (with the exact `mm
run --build --command --install` invocation to run), `reject` (with a reason:
false positive, non-deterministic, unsafe, or low value), or `needs-command`
(pattern is real, but the automation command itself needs a human to name,
same as `mm build` already refuses to invent one).

Add a **background nudge**: a `SessionEnd` hook that runs the existing
mining (`candidates()`, already used by `mm candidates`/`mm run`) and, if
anything clears the gate, writes `.mm/review-pending.json`. `/mm:status` reads
and reports it. Nothing more — no agent is spawned outside an explicit
`/mm:review` invocation.

Add **hook telemetry visibility**: `/mm:status` also reports each installed
hook's `.mm/hooks/<id>.state.json` (already written by `guard.mjs`) —
`consecutiveFailures`, `lastExitCode`, `disabledAt` — so a self-demoted hook
is visible without grepping `.mm/hooks/`.

## Constraints

- **Install stays human-gated.** The learning agent never calls `mm run
  --install` or writes to `.claude/settings.json`. Its output is a
  recommendation string the human runs themselves — same approval boundary
  M5/M6 already established.
- **No new scoring logic.** The agent consumes `@muscle-memory/aggregator`'s
  existing `ScoredPattern` output (steps, occurrences, score, example event
  records already on disk in `.mm/events/`); it does not reimplement or
  override the score, only judges what the score cannot see (safety,
  determinism beyond the numeric proxy, lifecycle placement).
- **No new demotion logic.** `guard.ts`'s `FAILURE_THRESHOLD` self-demotion is
  unchanged. `/mm:status` only reads and reports the state files that
  mechanism already writes.
- **The `SessionEnd` nudge writes one file, nothing else.** It re-runs
  existing mining (no new mining code), compares against the last written
  `.mm/review-pending.json` (skip the write if unchanged, so the file's mtime
  reflects "new candidate detected", not "session ended"), and must not block
  or slow session end beyond the mining call itself.
- **The learning agent has no write tools.** It gets `Read`, `Grep`, `Glob`,
  `Bash` scoped to read-only inspection (`cat`, `git log`, `mm run` with no
  `--build`) — it produces a verdict string, never edits a file or runs
  `mm-install`.
- **`/mm:review` does not install and does not build.** It surfaces the
  learning agent's verdicts as the terminal state — same contract `/mm:status`
  and `/mm:enable` already follow: report and offer, never act unasked.
