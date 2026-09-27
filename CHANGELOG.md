# Changelog

## 0.9.0 — 2026-09-26

- `mm-classifier` (`@muscle-memory/classifier`, bundled as
  `plugin/bin/mm-classifier.mjs`): classification flows backed by a local
  [Laya](https://github.com/NandhaKishorM/laya) server. `new` validates a
  definition and writes it only to an explicit `--store mm`
  (`.mm/classifiers/`) or `--out <path>`; `run` turns a JSON input into one
  decision; `test` checks the definition's own examples; `hook` adapts the
  decision to Claude Code hook JSON and fails open; `hook-fragment` prints
  the wiring without touching `settings.json`; `setup` installs Laya into
  a per-user virtualenv (CPU torch) and downloads its checkpoints;
  `server start|stop|status`
  runs `laya-serve` on 127.0.0.1, on CPU by default.
- Classifier `rules` (ordered regexes that decide without calling Laya) and
  `decide.next` (chain classifiers; names resolve next to the definition).
- Lint warnings on `new`/`test` for Laya's documented pitfalls; `test`
  splits accuracy into rules and Laya; `choice` accepts null glosses and
  label lists, `noul` accepts no criteria and a `labels` override.
- `classifier` skill: environment check, Laya install, writing a definition,
  asking where to store it, testing, and connecting it to a hook or any
  other flow.
- `plugin.json` version now matches the CHANGELOG (it still said 0.7.0).
- Living specs: placeholder `Purpose` sections replaced with real ones.

## 0.8.0 — 2026-09-22

- `/mm:review`: mines candidates the same way `mm run` does and dispatches the
  new `learning-agent` subagent (read-only) to judge each one for
  determinism, safety, lifecycle placement, and value. Prints verdicts and,
  for `recommend`, the exact `mm run --build <n> --command "<cmd>" --install`
  invocation — never runs it.
- `mm-nudge.mjs`: new `SessionEnd` hook binary. Mines candidates and, if the
  id set changed since the last run, writes `.mm/review-pending.json`. Same
  `.mm/` consent gate as the logger; installs nothing.
- `/mm:status`: reports `.mm/review-pending.json` (count, mined-at) and, per
  installed hook, its `.state.json` telemetry — `consecutiveFailures`,
  `lastExitCode`, `disabledAt` — with an explicit note when a hook has
  self-demoted.

## 0.7.0 — 2026-09-22

- `mm run` (`@muscle-memory/cli`): orchestrates M2-M5 in one command — mine and
  print by default, `--build <n> --command "<cmd>"` to compile a hook
  fragment, `--install` to install it. Replaces chaining four CLIs by hand.

## 0.6.0

- `mm-install` (`@muscle-memory/installer`): merges a built hook fragment into
  `.claude/settings.json` behind a guard, or removes it — the kill switch.

## 0.5.0

- `mm build` (`@muscle-memory/builder`): compiles a `hook`-target proposal
  into a `PostToolUse` fragment, never touching `.claude/settings.json`.

## 0.4.0

- `mm propose` (`@muscle-memory/learner`): turns a scored candidate into a
  markdown proposal — what the pattern is, why it scored the way it did, and
  what kind of automation it would become.

## 0.3.0

- `mm candidates` (`@muscle-memory/aggregator`): reads `.mm/events/`, mines
  and scores repeated sequences, prints — never writes.

## 0.2.0

- Event logger ships (`@muscle-memory/logger`): records tool calls to
  `.mm/events/`, gated behind `/mm:enable`.

## 0.1.0

- Initial plugin scaffold.
