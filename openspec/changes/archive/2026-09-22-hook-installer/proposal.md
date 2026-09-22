# Hook installer

## What Changes

M5: turn a built hook fragment into a live, self-demoting hook.
`mm install <fragment-file>` merges an `mm build` fragment into
`.claude/settings.json`'s `hooks.PostToolUse`, wrapped in a guard that
tracks consecutive failures and disables itself after too many. `mm
uninstall <id>` is the kill switch — it removes the entry and its state,
by hand, at any time.

## Why

M4 renders a hook fragment but refuses, on purpose, to write
`.claude/settings.json` — installing stayed a manual step until the pipeline
had something worth trusting. The principles this repo committed to up
front (README § Principles) require that trust be backed by machinery, not
good intentions: "a kill switch, git-versioned artifacts, and automatic
demotion are requirements, not polish." Nothing built so far provides any
of the three for an *installed* hook. This milestone does.

## What

- `@muscle-memory/installer`: merges a `HookFragment` into
  `.claude/settings.json`, assigns it a stable id, and points the settings
  entry at a small guard script instead of the raw command.
- The guard (`.mm/hooks/guard.mjs`, written once per repo, git-tracked):
  runs the real command, records each exit code in
  `.mm/hooks/<id>.state.json`, and after 3 consecutive non-zero exits,
  rewrites `.claude/settings.json` to remove its own entry — the hook
  disables itself rather than continuing to fail silently on every
  matching tool call.
- `mm install <fragment-file>`: writes the guard once, appends the
  `hooks.PostToolUse` entry, records `.mm/hooks/<id>.install.json` for
  audit (id, source signature, command, install time).
- `mm uninstall <id>`: removes the matching `hooks.PostToolUse` entry and
  its state/install records. The kill switch — always available, not
  gated on the demotion counter.

## Constraints

- Merges into `.claude/settings.json` are additive and idempotent: existing
  keys (`env`, other hook entries) are preserved untouched, and installing
  the same fragment twice does not duplicate the entry.
- The guard script is the only thing `mm install` points `settings.json`
  at — never the raw human command — so demotion is enforced by
  construction, not by convention.
- No `slash-command` / `mcp-tool` install support. `mm build` already
  refuses to produce those fragments (M4); this milestone only installs
  what M4 can produce.
