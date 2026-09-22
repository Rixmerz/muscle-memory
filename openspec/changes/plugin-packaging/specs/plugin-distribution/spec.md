## ADDED Requirements

### Requirement: The repository SHALL ship a Claude Code plugin

`plugin/.claude-plugin/plugin.json` SHALL declare the plugin's name, version,
description, author, license and repository. The plugin directory SHALL be
self-contained: every file it needs at runtime SHALL live under `plugin/`,
because an install copies that directory and runs no package manager, no build
and no dependency resolution.

`.claude-plugin/marketplace.json` at the repository root SHALL list the plugin
with a `git-subdir` source pointing at `plugin/`, so the repository can be added
as a marketplace directly.

#### Scenario: The manifest is valid and complete

- **WHEN** `plugin/.claude-plugin/plugin.json` is parsed
- **THEN** it is valid JSON
- **AND** it contains non-empty `name`, `version` and `description` fields

#### Scenario: The plugin directory has no unresolvable dependency

- **WHEN** every `import` and `require` in `plugin/bin/mm-log.mjs` is enumerated
- **THEN** each one resolves to a `node:` builtin
- **AND** none resolves to a workspace package or a `node_modules` path

#### Scenario: The marketplace entry points at the plugin subdirectory

- **WHEN** `.claude-plugin/marketplace.json` is parsed
- **THEN** its single plugin entry has `source.source` `"git-subdir"` and `source.path` `"plugin"`
- **AND** its plugin `name` equals the name in `plugin/.claude-plugin/plugin.json`

### Requirement: The logger SHALL be registered as a plugin hook

`plugin/hooks/hooks.json` SHALL register `mm-log` on `PreToolUse`,
`PostToolUse`, `UserPromptSubmit`, `SessionStart` and `SessionEnd`, each with
the `*` matcher and a timeout, invoking the bundled binary through
`${CLAUDE_PLUGIN_ROOT}`. Installing the plugin SHALL NOT modify
`~/.claude/settings.json` or any project's `.claude/settings.json`.

#### Scenario: Every registered hook resolves through the plugin root

- **WHEN** `plugin/hooks/hooks.json` is parsed
- **THEN** every command references `${CLAUDE_PLUGIN_ROOT}`
- **AND** no command references an absolute path outside the plugin

#### Scenario: The event names match what the logger accepts

- **WHEN** the hook event names in `hooks.json` are compared against `HookEventName`
- **THEN** every registered event name is a member of that type

### Requirement: Recording SHALL be opt-in per repository

The logger SHALL exit `0` without reading stdin when the working directory has
no `.mm/` directory. This check SHALL be the first thing the binary does, so an
opted-out repository pays one filesystem probe and no parsing. Installing the
plugin SHALL therefore record nothing anywhere until a user opts a repository
in.

`.mm/` is the consent artifact. Its absence SHALL NOT be treated as an error,
SHALL NOT be auto-created by the logger, and SHALL NOT produce output on stdout
or stderr.

#### Scenario: A repository without .mm records nothing

- **GIVEN** a directory with no `.mm/`
- **WHEN** `mm-log PreToolUse` receives a well-formed payload
- **THEN** the process exits `0`
- **AND** no file is created anywhere under that directory
- **AND** stdout and stderr are both empty

#### Scenario: The opt-out path is cheaper than the recording path

- **GIVEN** a directory with no `.mm/`
- **WHEN** the latency benchmark runs against it
- **THEN** its p99 is no greater than the p99 measured with recording enabled

#### Scenario: Opting in starts recording

- **GIVEN** a directory in which `.mm/` has been created
- **WHEN** `mm-log PreToolUse` receives a well-formed payload
- **THEN** one record is appended under `.mm/events/`

### Requirement: The shipped binary SHALL be reproducible from source

A `bundle` script SHALL produce `plugin/bin/mm-log.mjs` from
`packages/mm-logger/src/bin.ts` and its workspace dependency, as a single ESM
file with no external imports. Re-running it on an unchanged source tree SHALL
produce a byte-identical file, so that a committed bundle diverging from source
is visible in review rather than invisible.

#### Scenario: The bundle is reproducible

- **GIVEN** a clean working tree
- **WHEN** the bundle script is run
- **THEN** `git status --porcelain plugin/bin/mm-log.mjs` reports no change

#### Scenario: The bundle is executable as a hook

- **WHEN** `node plugin/bin/mm-log.mjs PreToolUse` is run in a directory with `.mm/`, with a well-formed payload on stdin
- **THEN** it exits `0`
- **AND** one record is appended
