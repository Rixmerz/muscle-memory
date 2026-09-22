# event-logging Specification

## Purpose
TBD - created by archiving change event-logger. Update Purpose after archive.
## Requirements
### Requirement: The logger SHALL append one record per hook invocation

The `mm-log` binary SHALL read a single JSON object from stdin, and append
exactly one newline-terminated JSON record to
`<project>/.mm/events/<YYYY-MM-DD>.ndjson`, where the date is the UTC date of
the invocation. The file and its parent directories SHALL be created if absent.

#### Scenario: A PreToolUse payload produces one record

- **GIVEN** `.mm/events/` does not exist
- **WHEN** `mm-log PreToolUse` receives `{"session_id":"s1","cwd":"/r","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"pnpm test"}}` on stdin
- **THEN** `.mm/events/<today>.ndjson` exists and contains exactly one line
- **AND** that line parses as JSON with `event` `"PreToolUse"` and `tool` `"Bash"`

#### Scenario: Concurrent invocations do not interleave

- **GIVEN** 50 `mm-log` invocations run concurrently against the same day file
- **WHEN** all of them have exited
- **THEN** the file contains exactly 50 lines
- **AND** every line parses as JSON

### Requirement: The logger SHALL never fail the tool call

The binary SHALL exit `0` on every path, including malformed stdin, absent
stdin, an unwritable `.mm/` directory, and a full disk. It SHALL write nothing
to stdout. Diagnostics, if any, SHALL go to stderr and SHALL NOT be a JSON
object, so that a hook consumer parsing stdout is never handed one.

#### Scenario: Malformed stdin

- **WHEN** `mm-log PreToolUse` receives the bytes `not json` on stdin
- **THEN** the process exits `0`
- **AND** stdout is empty

#### Scenario: Unwritable event directory

- **GIVEN** `.mm/events/` exists with mode `0500`
- **WHEN** `mm-log PreToolUse` receives a well-formed payload
- **THEN** the process exits `0`
- **AND** no partial line is left in the day file

#### Scenario: Empty stdin

- **WHEN** `mm-log PreToolUse` is invoked with stdin closed immediately
- **THEN** the process exits `0` within the latency budget

### Requirement: The logger SHALL meet a per-invocation latency budget

End-to-end wall time for one invocation — process start to exit — SHALL be at
most 30 ms at p99, measured over at least 200 sequential invocations on a warm
filesystem. The measurement SHALL be a committed benchmark, not a manual
observation, and it SHALL report p50, p95 and p99.

The budget covers Node's own startup. If cold start alone exceeds it, the
benchmark SHALL fail rather than the budget being quietly restated, and the
number SHALL be renegotiated by amending this requirement.

#### Scenario: The benchmark reports the distribution

- **WHEN** the latency benchmark runs 200 invocations
- **THEN** it reports p50, p95 and p99 in milliseconds
- **AND** it exits non-zero if p99 exceeds 30 ms

### Requirement: Records SHALL carry a version and a stable field set

Every record SHALL contain `v` (integer schema version, `1` for this change),
`ts` (ISO-8601 UTC with milliseconds), `session`, `cwd`, `event`, `tool`, and
`sig`. `ok` and `dur_ms` SHALL be present on `PostToolUse` records and absent
on `PreToolUse` records. An unknown or absent `tool_name` SHALL yield
`tool: "unknown"` rather than dropping the record.

#### Scenario: A PostToolUse record carries the outcome

- **WHEN** `mm-log PostToolUse` receives a payload whose `tool_response` reports success
- **THEN** the record has `ok: true`
- **AND** the record has a numeric `dur_ms`

#### Scenario: An unrecognised tool is still recorded

- **WHEN** a payload arrives with no `tool_name`
- **THEN** one record is appended with `tool` `"unknown"`

### Requirement: Backfill SHALL replay existing transcripts into the same format

A `mm-log backfill` subcommand SHALL read Claude Code transcripts from
`~/.claude/projects/<slug>/*.jsonl` and emit records in the format above, into
`.mm/events/` partitioned by the date of each original event rather than the
date of the backfill run. Re-running backfill over the same transcripts SHALL
NOT duplicate records.

#### Scenario: Backfill is idempotent

- **GIVEN** backfill has been run once over a transcript directory
- **WHEN** it is run a second time over the same directory unchanged
- **THEN** the total line count across `.mm/events/` is unchanged

#### Scenario: Records land on the original date

- **GIVEN** a transcript containing a tool call from three days ago
- **WHEN** backfill runs today
- **THEN** that record is written to the day file for three days ago

