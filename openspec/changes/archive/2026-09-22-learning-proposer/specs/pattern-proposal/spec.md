## ADDED Requirements

### Requirement: Proposal classification
The system SHALL classify a scored candidate's suggested automation target as
either `hook` or `slash-command`, using a fixed heuristic: a candidate whose
steps are all the same `bash:*` signature classifies as `hook`; any other
candidate classifies as `slash-command`.

#### Scenario: Single repeated bash signature
- **GIVEN** a scored candidate whose every step has signature `bash:pnpm-test`
- **WHEN** `formatProposal` classifies it
- **THEN** the suggested target is `hook`

#### Scenario: Mixed tool sequence
- **GIVEN** a scored candidate with steps `["bash:pnpm-test", "edit:java"]`
- **WHEN** `formatProposal` classifies it
- **THEN** the suggested target is `slash-command`

### Requirement: Proposal rendering
The system SHALL render each scored candidate as a markdown document
containing the step sequence, the six score factors with their values, the
suggested target, and one sentence of rationale.

#### Scenario: Rendered proposal contains score breakdown
- **GIVEN** a scored candidate with `score: 0.85` and its six factor values
- **WHEN** `formatProposal` renders it
- **THEN** the output markdown lists all six factor names and values

### Requirement: CLI reuses the aggregator pipeline
`mm propose` SHALL read candidates through `@muscle-memory/aggregator`'s
`candidates()` function, applying the same `--min-score` default of `0.80`,
and SHALL NOT re-implement event reading, mining, or scoring.

#### Scenario: No .mm directory
- **GIVEN** no `.mm/` directory exists in the working directory
- **WHEN** `mm propose` runs
- **THEN** it exits 0 and prints nothing

#### Scenario: Below-threshold candidate omitted
- **GIVEN** a mined pattern scoring below 0.80
- **WHEN** `mm propose` runs with default `--min-score`
- **THEN** no proposal is printed for that pattern

### Requirement: Write mode persists inside the consent boundary
`mm propose --write` SHALL write each rendered proposal to
`.mm/proposals/<date>-<slug>.md` and SHALL NOT write anywhere outside `.mm/`.

#### Scenario: Write flag persists a file
- **GIVEN** a scored candidate at or above the threshold
- **WHEN** `mm propose --write` runs
- **THEN** a markdown file is created under `.mm/proposals/`

### Requirement: No automation is generated or installed
The system SHALL NOT compile a hook, write to `plugin/`, or modify any
`.claude/settings.json` or similar configuration as part of proposing.

#### Scenario: Propose does not touch plugin or settings
- **GIVEN** `mm propose` or `mm propose --write` runs
- **WHEN** it completes
- **THEN** no file under `plugin/` or any `.claude/settings.json` is modified
