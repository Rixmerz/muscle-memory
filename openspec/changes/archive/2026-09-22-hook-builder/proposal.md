# Hook builder

M4: turn an approved `hook`-target proposal into an installable Claude Code
hook fragment. `mm build <proposal-file> --command "<real command>"` reads a
proposal written by M3's `mm propose --write`, validates a human-supplied
command against the proposal's mined signature, and renders a hook config
JSON. It never edits `.claude/settings.json` and never runs automatically —
approval stays a human action.

## Why

M1-M3 observe, rank, and explain a pattern. Nothing yet turns an approved one
into automation. Without this, `.mm/proposals/*.md` is where the pipeline
dead-ends — a human reads a proposal and has no next step but writing the
hook by hand.

## What

- `@muscle-memory/builder`: parses a proposal's steps and target kind,
  reduces the human's `--command` to a signature via
  `@muscle-memory/core`'s `toolSignature`, and refuses to build unless it
  matches the proposal's own step signature.
- `mm build` CLI: `hook` target only. `slash-command` and `mcp-tool` targets
  are refused with a clear "not implemented" message — those are later
  milestones, not silently mis-handled here.
- Output is a hook config fragment written to `.mm/hooks/<date>-<slug>.json`
  (git-tracked, unlike `.mm/events/`), never merged into
  `.claude/settings.json` automatically. Installing it — copying the
  fragment's hook entry into the project's or the plugin's hook
  configuration — stays a manual, reviewable step.

## Constraints

- The event log never stored raw commands (only a normalised signature and
  an arg hash), so the real command cannot be recovered from mined data
  alone — the human must supply it, and the tool's job is to validate it
  against what was actually observed, not to invent it.
- No `.claude/settings.json` writes in this change. That is a future
  milestone's job, once the manual step has been exercised enough to trust.
