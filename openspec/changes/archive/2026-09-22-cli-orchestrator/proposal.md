# Proposal: cli-orchestrator

## Why

M1-M5 shipped four independent CLIs (`mm candidates`, `mm propose`, `mm build`,
`mm-install`) that a human currently chains by hand: run one, copy its output
path into the next command's argument, repeat. Nothing wires them together,
and the README's own "Development" workflow already narrates them as a single
pipeline. This milestone adds the orchestrator, not new mining, scoring, or
installation logic.

## What

Add `@muscle-memory/cli`, a package whose `mm run` binary calls the other four
packages' existing public functions in-process and prints the same output a
human running them by hand would see — one command instead of four.

## Constraints

- No new mining, scoring, hook-building, or settings-merge logic. `mm run`
  is a thin dispatcher over `@muscle-memory/aggregator`'s `candidates()`,
  `@muscle-memory/learner`'s `formatProposal()`, `@muscle-memory/builder`'s
  `buildHook()`, and `@muscle-memory/installer`'s install path
  (`deriveId`/`installEntry`/`writeSettings`).
- Do not modify `mm-aggregator`, `mm-learner`, `mm-builder`, or
  `mm-installer` internals — `mm-cli` depends on them read-only.
- No interactive prompts (no stdin wizard). Every decision point is a flag,
  matching the flag-driven shape of every existing CLI in this repo.
- Default behaviour (no flags) is read-only: mine and print proposals, write
  nothing. Writing a hook fragment requires `--build <n> --command`;
  installing it requires the further, explicit `--install`. Nothing is
  written or installed without both.
- `slash-command`-target proposals are rejected the same way `mm build`
  already rejects them (`mm build` has no slash-command support yet) — this
  milestone does not add it.
