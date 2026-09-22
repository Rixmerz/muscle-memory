## Why

muscle-memory's later milestones ship three skills (`pattern-evaluator`,
`hook-architect`, `hook-validator`) and a learning subagent. Skills and
subagents are not things a repository can hand a user — Claude Code loads them
from a **plugin**. Without plugin packaging, M3 has nowhere to put its own
deliverables, and M1's logger has no way to reach a user's hook chain except by
asking them to hand-edit `~/.claude/settings.json`.

Deciding this now rather than at M3 also settles a question M1 is about to
answer wrongly by default: **what turns recording on.** A plugin that registers
`PreToolUse` on `*` starts recording in every repository the moment it is
installed. That is not a consent model, and retrofitting one after people have
logs is worse than shipping one.

## What Changes

- The repository becomes a plugin host: `plugin/` holds a Claude Code plugin
  (`.claude-plugin/plugin.json`, `hooks/`, `commands/`, `agents/`, `skills/`),
  and `.claude-plugin/marketplace.json` at the root lets the repo be added
  directly as a marketplace.
- The logger reaches users as a plugin hook — `hooks/hooks.json` registers
  `mm-log` on `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `SessionStart`
  and `SessionEnd` — instead of through an edit to the user's settings.
- **Recording becomes opt-in per repository.** The logger exits immediately,
  before parsing stdin, in any working directory with no `.mm/` directory.
  Installing the plugin records nothing until `/mm:enable` is run in a repo.
- New commands `/mm:enable`, `/mm:status`, `/mm:backfill`.
- A build step bundles `@muscle-memory/logger` and its workspace dependency
  into a single dependency-free `plugin/bin/mm-log.mjs`, committed, because a
  `git-subdir` install copies files and runs no package manager.
- **BREAKING for the M4 design as previously sketched**: the logger hook is no
  longer installed by writing to `~/.claude/settings.json`. Hooks that
  muscle-memory *generates* still are — they cannot live in a version-pinned
  plugin cache directory — and they keep their approval gate.

## Capabilities

### New Capabilities

- `plugin-distribution`: what the plugin ships, how the logger is registered,
  and the per-repository opt-in that decides whether it records anything.

### Modified Capabilities

None yet. `event-logging` gains the opt-in check as part of *this* change's
`plugin-distribution` requirements rather than as a modification, because the
check is packaging behaviour: it is about whether the logger should run at all
in this directory, not about what it records once it does.

## Impact

- New `plugin/` tree and root `.claude-plugin/marketplace.json`.
- `packages/mm-logger/src/bin.ts` gains one early return — the `.mm/` check —
  which must sit before stdin is read, so a repo that opted out pays one `stat`
  and nothing else.
- Root `package.json` gains a `bundle` script and an `esbuild` devDependency.
- `plugin/bin/mm-log.mjs` is committed build output. That is normally wrong;
  here it is the delivery mechanism, since `git-subdir` copies the directory
  and never runs `pnpm install`.
- `plugin/agents/` and `plugin/skills/` are created empty and filled at M3.
  Shipping placeholder skills now would advertise capability that does not
  exist.
