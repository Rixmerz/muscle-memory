## ADDED Requirements

### Requirement: mm build parses a proposal file
`mm build <proposal-file>` SHALL extract the mined step signatures and the
suggested target kind from a proposal file produced by `mm propose --write`.

#### Scenario: valid hook proposal
- **GIVEN** a proposal file containing a `## Steps` fenced block with one
  signature `bash:pnpm-test` and `## Suggested target: \`hook\``
- **WHEN** `mm build` parses it
- **THEN** it reads target `hook` and steps `["bash:pnpm-test"]`

#### Scenario: file is not a proposal
- **GIVEN** a file lacking a `## Steps` block or a `## Suggested target` line
- **WHEN** `mm build <file>` runs
- **THEN** it exits non-zero with an error naming the file and stating it is
  not a muscle-memory proposal

### Requirement: mm build only compiles hook-target proposals
`mm build` SHALL refuse to build a `slash-command` (or any non-`hook`)
target proposal in this change.

#### Scenario: slash-command proposal rejected
- **GIVEN** a parsed proposal with target `slash-command`
- **WHEN** `mm build <file> --command "..."` runs
- **THEN** it exits non-zero with a message stating slash-command build is
  not implemented, and writes nothing

### Requirement: mm build requires and validates a human-supplied command
`mm build` SHALL require `--command` and SHALL refuse to produce a hook
fragment unless that command's computed signature matches the proposal's
mined signature.

#### Scenario: command omitted
- **GIVEN** a valid `hook` proposal file
- **WHEN** `mm build <file>` runs without `--command`
- **THEN** it exits non-zero stating `--command` is required, and writes
  nothing

#### Scenario: command matches the mined signature
- **GIVEN** a `hook` proposal with steps `["bash:pnpm-test"]`
- **WHEN** `mm build <file> --command "pnpm test"` runs
- **THEN** `toolSignature("Bash", { command: "pnpm test" })` equals
  `"bash:pnpm-test"` and the build succeeds

#### Scenario: command does not match the mined signature
- **GIVEN** a `hook` proposal with steps `["bash:pnpm-test"]`
- **WHEN** `mm build <file> --command "rm -rf node_modules"` runs
- **THEN** it exits non-zero, showing both the expected and the computed
  signature, and writes nothing

### Requirement: a successful build renders a PostToolUse hook fragment
On success, `mm build` SHALL produce a JSON object describing a
`PostToolUse` hook that runs the supplied command, with the mined signature
kept for provenance.

#### Scenario: fragment shape
- **GIVEN** a successful build with command `"pnpm test"` and mined
  signature `"bash:pnpm-test"`
- **WHEN** the fragment is produced
- **THEN** it is `{ "event": "PostToolUse", "matcher": "Bash", "command":
  "pnpm test", "sourceSignature": "bash:pnpm-test" }`

### Requirement: --write persists the fragment without installing it
`mm build --write` SHALL write the fragment to `.mm/hooks/`, and `mm build`
SHALL NOT, with or without `--write`, modify `.claude/settings.json` or any
other Claude Code hook configuration.

#### Scenario: --write creates a tracked file
- **GIVEN** a successful build and `--write`
- **WHEN** the CLI finishes
- **THEN** `.mm/hooks/<date>-<slug>.json` exists with the fragment's content,
  and `.mm/hooks/` is not listed in `.gitignore`

#### Scenario: no settings.json write ever happens
- **GIVEN** any successful or failed `mm build` invocation, with or without
  `--write`
- **WHEN** the CLI finishes
- **THEN** `.claude/settings.json` is byte-for-byte unchanged
