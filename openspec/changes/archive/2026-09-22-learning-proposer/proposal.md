## Why

`mm candidates` (M2) scores mined patterns but only prints a table — nobody
reads a score in isolation and decides what to build from it. M3 is the
smallest useful next step: turn a scored candidate into a human-readable
proposal that names what the pattern is, why it scored the way it did, and
what kind of automation it would become — without writing any automation.
That decision, and the code for it, stays M4.

## What

Add `@muscle-memory/learner`, a package shaped like `mm-aggregator`:

- `formatProposal(candidate)` classifies a candidate's target shape by a
  fixed heuristic (single repeated `bash:*` signature → hook; multi-tool
  sequence → slash command) and renders a markdown explanation: the step
  sequence, the six-factor score breakdown, the suggested target, and why.
- `mm propose [--min-score 0.8] [--write]` — CLI reusing
  `@muscle-memory/aggregator`'s `candidates()` pipeline, printing proposals
  to stdout; `--write` persists each to `.mm/proposals/<date>-<slug>.md`,
  already inside the gitignored `.mm/` consent boundary.

Out of scope: no hook compiling, no code generation, no `plugin/`
interaction, no automatic install. Read-only in, markdown out.
