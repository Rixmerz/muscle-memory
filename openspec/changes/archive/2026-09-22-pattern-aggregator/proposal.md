# Pattern aggregator

M2: mine `.mm/events/*.ndjson` for repeated tool-call sequences, score them,
and surface the ones that clear a threshold through `mm candidates`. Nothing
here compiles a hook or writes automation — this is read-only analysis over
the M1 logger's output. The learning subagent and hook builder (M3/M4) act on
what this produces; they are not part of this change.

## Why

`muscle-memory`'s whole premise is that repeated behaviour is worth
automating — but nothing yet turns the recorded events into a ranked list of
candidates a human could look at. Without this, the logger just accumulates
NDJSON nobody reads.

## What

- `@muscle-memory/aggregator`: reads day files, groups events into per-session
  ordered sequences of `PreToolUse` signatures, mines contiguous n-grams
  (length 2–4), and scores each distinct pattern.
- `mm candidates` CLI: prints ranked candidates at or above score 0.80.
- Score is a weighted product of six factors minus a variability penalty,
  clamped to `[0,1]` — see `design.md` for the exact definitions.
