# muscle-memory

Compiles repeated agent behaviour into executable automation.

Claude Code repeats sequences: edit a Java file, run the formatter, run the test.
`muscle-memory` observes those sequences through hooks, mines them into patterns,
and — only when hard gates pass and a human approves — compiles them into a hook,
a slash command, or an MCP tool.

## Status

Pre-M1. Nothing is installed into `~/.claude` by this repo yet.

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

## Development

```sh
pnpm install
pnpm build
pnpm test
pnpm lint
```

pnpm only. Never npm.
