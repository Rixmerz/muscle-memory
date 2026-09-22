# pattern-aggregation Specification

## Purpose
TBD - created by archiving change pattern-aggregator. Update Purpose after archive.
## Requirements
### Requirement: Session sequences are mined for contiguous signature n-grams
The aggregator SHALL read every `.mm/events/*.ndjson` day file under a given
root, group events by `session`, order each session's events by `ts`, and
slide a window of length 2 to 4 over the ordered `PreToolUse` signatures
(`sig`) to produce candidate n-grams. A window MUST NOT cross a session
boundary.

#### Scenario: Two sessions produce independent windows
- **GIVEN** `.mm/events/2026-09-20.ndjson` contains `PreToolUse` records for
  session `a` with signatures `[x, y, z]` and session `b` with signatures
  `[x, y]`
- **WHEN** the aggregator mines n-grams of length 2
- **THEN** it produces `x→y` (from both sessions) and `y→z` (from session `a`
  only), and never a window spanning `z` (session `a`) followed by `x`
  (session `b`)

#### Scenario: A day file with fewer events than the minimum window length yields no pattern
- **GIVEN** a session with exactly one `PreToolUse` event
- **WHEN** the aggregator mines n-grams of length 2 to 4
- **THEN** no pattern is produced for that session

### Requirement: Each mined pattern is scored by six factors and a variability penalty
For a pattern observed across the corpus, the aggregator SHALL compute:

- `frecuencia = min(1, occurrences / 10)`
- `consistencia = distinct_sessions_containing_pattern / total_sessions`
- `repeticion_temporal = distinct_days_seen / total_days_observed`
- `exito = occurrences_where_every_step_ok / occurrences`, where a step's
  outcome is the `ok` field of the `PostToolUse` record matching that step's
  `PreToolUse` by session and adjacency; a step with no matching
  `PostToolUse` counts as successful
- `determinismo = 1 - (distinct_arg_hashes / occurrences)`, over the `arg`
  field of the pattern's first step
- `ahorro_potencial = window_length / 4`
- `variabilidad = clamp(stdev(gap_ms) / mean(gap_ms), 0, 1)`, where `gap_ms`
  is the wall-clock time in milliseconds between the start timestamps of
  consecutive occurrences of the pattern; a pattern with fewer than two
  occurrences has `variabilidad = 0`

`score = clamp(frecuencia × consistencia × repeticion_temporal × exito ×
determinismo × ahorro_potencial − variabilidad, 0, 1)`.

#### Scenario: A pattern that occurs once scores low on frequency and consistency
- **GIVEN** a pattern occurs exactly once, in one session, on one day
- **WHEN** its score is computed
- **THEN** `frecuencia = 0.1`, `consistencia` and `repeticion_temporal` are
  each `1 / total_sessions` and `1 / total_days_observed` respectively, and
  `variabilidad = 0`

#### Scenario: A pattern whose steps always fail scores zero on success
- **GIVEN** every occurrence of a pattern has at least one step whose matching
  `PostToolUse.ok` is `false`
- **WHEN** its score is computed
- **THEN** `exito = 0` and the overall `score = 0`

#### Scenario: Identical arguments across every occurrence maximize determinism
- **GIVEN** a pattern's first step has the same `arg` hash in every
  occurrence
- **WHEN** its score is computed
- **THEN** `determinismo = 1`

### Requirement: `mm candidates` lists patterns at or above the score threshold
The CLI SHALL read the current repository's `.mm/events/`, run the mining and
scoring pipeline, and print patterns with `score >= 0.80` ordered by score
descending. It SHALL exit 0 with no output when `.mm/` does not exist or
contains no events, and MUST NOT write anything to disk.

#### Scenario: No `.mm/` directory
- **GIVEN** the current working directory has no `.mm/` directory
- **WHEN** `mm candidates` runs
- **THEN** it exits 0 and prints nothing

#### Scenario: Candidates below threshold are omitted
- **GIVEN** the corpus contains one pattern scoring 0.92 and one scoring 0.61
- **WHEN** `mm candidates` runs
- **THEN** only the 0.92 pattern is printed

#### Scenario: `--json` emits machine-readable output
- **GIVEN** at least one candidate clears the threshold
- **WHEN** `mm candidates --json` runs
- **THEN** stdout is a JSON array of objects each carrying the pattern's
  signature sequence, `score`, `occurrences`, and `sessions` count

