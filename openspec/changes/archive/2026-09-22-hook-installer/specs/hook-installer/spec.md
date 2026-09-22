## ADDED Requirements

### Requirement: mm install merges a hook fragment into settings.json
`mm install <fragment-file>` SHALL parse a `HookFragment` JSON and append a
corresponding entry to `.claude/settings.json`'s `hooks.PostToolUse` array,
preserving every other key already in the file.

#### Scenario: first install on an existing settings.json
- **GIVEN** a `.claude/settings.json` containing only `{ "env": {...} }`
- **WHEN** `mm install fragment.json` runs with a valid `HookFragment`
- **THEN** the file gains a `hooks.PostToolUse` entry pointing at the guard,
  and the original `env` key is unchanged

#### Scenario: invalid fragment shape rejected
- **GIVEN** a JSON file that is not a well-formed `HookFragment` (missing
  `command`, or `event` other than `PostToolUse`)
- **WHEN** `mm install <file>` runs
- **THEN** it exits non-zero, writes nothing, and states which field is
  missing or unsupported

### Requirement: install is idempotent
Installing the same fragment twice SHALL NOT create a duplicate
`hooks.PostToolUse` entry.

#### Scenario: re-install is a no-op merge
- **GIVEN** a fragment already installed with id `X`
- **WHEN** `mm install` runs again on the identical fragment
- **THEN** `.claude/settings.json`'s `hooks.PostToolUse` array still
  contains exactly one entry for id `X`

### Requirement: the installed entry runs through the guard, never the raw command
`mm install` SHALL point the settings entry at `.mm/hooks/guard.mjs`,
never directly at the human-supplied command.

#### Scenario: guard is written once
- **GIVEN** no `.mm/hooks/guard.mjs` exists yet
- **WHEN** `mm install` runs
- **THEN** `.mm/hooks/guard.mjs` is created, and the new settings entry's
  command invokes it with the fragment's id and command as arguments

#### Scenario: existing guard is not overwritten
- **GIVEN** `.mm/hooks/guard.mjs` already exists
- **WHEN** `mm install` runs again (same or a different fragment)
- **THEN** the existing `guard.mjs` file's contents are unchanged

### Requirement: the guard self-demotes after 3 consecutive failures
The guard SHALL run the real command, track consecutive non-zero exits in
`.mm/hooks/<id>.state.json`, and remove its own `hooks.PostToolUse` entry
from `.claude/settings.json` once that count reaches 3.

#### Scenario: failures under the threshold surface but do not disable
- **GIVEN** an installed hook whose command has failed once so far
- **WHEN** the guarded command fails again (2nd consecutive failure)
- **THEN** `.mm/hooks/<id>.state.json` records `consecutiveFailures: 2`,
  the guard exits with the real command's exit code, and the
  `hooks.PostToolUse` entry for `<id>` is still present

#### Scenario: the third consecutive failure disables the hook
- **GIVEN** an installed hook with `consecutiveFailures: 2` recorded
- **WHEN** the guarded command fails again (3rd consecutive failure)
- **THEN** the entry for `<id>` is removed from
  `.claude/settings.json`'s `hooks.PostToolUse`, the state file records
  `disabledAt`, and the guard still exits with the real command's exit code

#### Scenario: a success resets the streak
- **GIVEN** an installed hook with `consecutiveFailures: 1` recorded
- **WHEN** the guarded command exits 0
- **THEN** `.mm/hooks/<id>.state.json` records `consecutiveFailures: 0`
  and the `hooks.PostToolUse` entry for `<id>` is untouched

### Requirement: mm uninstall is an unconditional kill switch
`mm uninstall <id>` SHALL remove the matching `hooks.PostToolUse` entry and
its records, regardless of demotion state, and SHALL NOT error if the id is
already absent.

#### Scenario: uninstall a live hook
- **GIVEN** an installed, non-demoted hook with id `X`
- **WHEN** `mm uninstall X` runs
- **THEN** the `hooks.PostToolUse` entry for `X` is removed, and
  `.mm/hooks/X.install.json` / `.mm/hooks/X.state.json` no longer exist

#### Scenario: uninstall a already-removed id is not an error
- **GIVEN** no installed hook has id `Y`
- **WHEN** `mm uninstall Y` runs
- **THEN** it exits 0 and leaves `.claude/settings.json` unchanged
