# muscle-memory

Compiles repeated agent behaviour into executable automation.

Claude Code repeats sequences: edit a Java file, run the formatter, run the test.
`muscle-memory` observes those sequences through hooks, mines them into patterns,
and — only when hard gates pass and a human approves — compiles them into a hook,
a slash command, or an MCP tool.

## Status

M1: the event logger ships. Nothing is mined, compiled or installed yet — the
plugin only records, and only where you asked it to.

## Install

```sh
claude plugin marketplace add Rixmerz/muscle-memory
claude plugin install muscle-memory
```

Installing records nothing. The hooks are live in every session, and they exit
immediately in every repository that has no `.mm/` directory. Recording starts
in one repository at a time:

```sh
/mm:enable      # creates .mm/ here, and gitignores it
```

Stop recording by deleting the directory — `rm -rf .mm` revokes the consent and
the data in one step.

### What a record contains

One line per tool call, in `.mm/events/YYYY-MM-DD.ndjson`:

```json
{"v":1,"ts":"2026-09-22T14:11:00.777Z","session":"a4edc520-…","cwd":"/Users/you/repo",
 "event":"PreToolUse","tool":"Bash","sig":"bash:pnpm-test","arg":"aca635aaebec"}
```

`sig` is a normalised, low-cardinality shape of the call — the verb and the kind
of thing it acted on. `arg` is a hash. Neither the arguments, the file contents,
the command output, nor your prompts are written anywhere: the miner needs to
know *that* you ran the formatter after editing a Java file, not what was in it.

## Principles

- **Observe first, install last.** The logger and the aggregator ship before the
  builder. If the miner finds no pattern that clears the gates on real history,
  the rest is not built.
- **Gates are boolean, the score only ranks.** A weighted product lets a large
  sample size compensate low confidence; separate the two.
- **Approval is the default, automation is opt-in.** This writes self-executing
  code into settings. A kill switch, git-versioned artifacts, and automatic
  demotion are requirements, not polish.

## Packages

| Package | Role |
|---|---|
| `@muscle-memory/core` | event types, signature normalisation, scoring, gates |
| `@muscle-memory/logger` | the hook binary: stdin JSON → append NDJSON, never blocks |

`plugin/` is the Claude Code plugin itself — manifest, hooks, commands, and a
committed bundle of the logger at `plugin/bin/mm-log.mjs`. A plugin install
copies files and runs no package manager, so that bundle is the delivery
mechanism; `pnpm bundle` regenerates it and the test suite fails if the
committed copy and a fresh build differ.

## Development

```sh
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm bundle    # after any change under packages/mm-logger

pnpm --filter @muscle-memory/logger bench    # the 30 ms hook budget
```

pnpm only. Never npm.
