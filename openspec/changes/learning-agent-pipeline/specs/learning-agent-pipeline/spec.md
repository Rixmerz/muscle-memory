## ADDED Requirements

### Requirement: `SessionEnd` nudge flags new candidates without installing anything
On session end, in a repository with `.mm/` present, muscle-memory SHALL mine
candidates the same way `mm run` does and, if the resulting candidate id set
differs from the last recorded set, write `.mm/review-pending.json`
containing the candidate ids, their count, and the mining timestamp. It SHALL
write nothing else, install nothing, and exit immediately in a repository
without `.mm/`.

#### Scenario: no `.mm/` directory
- **WHEN** a session ends in a repository with no `.mm/` directory
- **THEN** the nudge exits without reading `.mm/events/` or writing any file

#### Scenario: unchanged candidate set
- **WHEN** a session ends and the mined candidate id set is identical to the
  one already recorded in `.mm/review-pending.json`
- **THEN** the file is not rewritten (its mtime is unchanged)

#### Scenario: new candidate appears
- **WHEN** a session ends and mining produces a candidate id not present in
  the last recorded set
- **THEN** `.mm/review-pending.json` is written with the new id set, its
  count, and a fresh `minedAt` timestamp

### Requirement: `/mm:review` judges each candidate through a read-only learning agent
Running `/mm:review` SHALL mine candidates the same way `mm run` does, and for
each one dispatch the `learning-agent` subagent with that candidate's steps,
occurrences, score, and up to 3 example event records. It SHALL print each
returned verdict and, for a `recommend` verdict, the exact `mm run --build
<n> --command "<cmd>" --install` invocation. It SHALL NOT build, install, or
write any file itself.

#### Scenario: no candidates clear the gate
- **WHEN** `/mm:review` is run in a repository whose mined candidates are
  empty
- **THEN** it states so and dispatches no agent

#### Scenario: a candidate is recommended
- **WHEN** the learning agent returns `{"verdict":"recommend","command":"pnpm test"}`
  for candidate index `0`
- **THEN** `/mm:review` prints the verdict and the literal command `mm run
  --build 0 --command "pnpm test" --install`
- **AND** it does not execute that command

#### Scenario: a candidate is rejected
- **WHEN** the learning agent returns `{"verdict":"reject","reason":"false-positive"}`
  for a candidate
- **THEN** `/mm:review` prints the rejection and its reason
- **AND** no build command is printed for that candidate

#### Scenario: `/mm:review` never installs
- **WHEN** `/mm:review` completes with one or more `recommend` verdicts
- **THEN** `.claude/settings.json` is unchanged
- **AND** no file under `.mm/hooks/` is created

### Requirement: the learning agent rejects non-deterministic and unsafe patterns
Given a candidate's steps and example event records, the learning-agent
subagent SHALL return `reject` with reason `false-positive` when the sequence
is a retry-after-failure pattern rather than a stable procedure, `unsafe` when
the implied command is destructive, and `low-value` when the candidate's
occurrences span fewer than 3 sessions or 2 days even if its numeric score
cleared the gate.

#### Scenario: retry-after-failure pattern
- **WHEN** the candidate's steps are a test run followed by a dependency
  reinstall followed by the same test run, repeated because the test is flaky
- **THEN** the agent returns `reject` with reason `false-positive`

#### Scenario: destructive command implied
- **WHEN** the candidate's evidence implies a `git push --force` or an `rm`
  against tracked paths
- **THEN** the agent returns `reject` with reason `unsafe`

#### Scenario: thin sample despite a high score
- **WHEN** a candidate's occurrences come from a single session on a single
  day, regardless of its numeric score
- **THEN** the agent returns `reject` with reason `low-value`

### Requirement: the learning agent flags un-buildable lifecycle placements instead of recommending them
When a candidate's trigger is not a tool call `mm build` can compile today
(only `PostToolUse`/`Bash` fragments are supported), the learning agent SHALL
return `needs-command` naming the unsupported lifecycle point, rather than a
`recommend` verdict.

#### Scenario: non-tool-call trigger
- **WHEN** a candidate's trigger is a session-start or prompt-submission
  event rather than a tool call
- **THEN** the agent returns `needs-command` and names the trigger as
  unsupported by `mm build`

### Requirement: `/mm:status` reports pending review and installed-hook telemetry
`/mm:status` SHALL report, in addition to its existing event-log summary: the
contents of `.mm/review-pending.json` when present (count and mined-at
timestamp, with a pointer to `/mm:review`), and for each
`.mm/hooks/<id>.install.json`, the paired `.mm/hooks/<id>.state.json` fields
(`consecutiveFailures`, `lastExitCode`, `disabledAt`) when that state file
exists.

#### Scenario: review-pending file present
- **WHEN** `.mm/review-pending.json` exists with `count: 2`
- **THEN** `/mm:status` reports 2 candidates pending review and names
  `/mm:review` as the way to see them judged

#### Scenario: a hook has self-demoted
- **WHEN** an installed hook's `.state.json` has a non-null `disabledAt`
- **THEN** `/mm:status` reports that hook as disabled, states it was
  self-demoted after repeated failures, and shows `consecutiveFailures`
