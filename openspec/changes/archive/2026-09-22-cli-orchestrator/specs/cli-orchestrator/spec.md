## ADDED Requirements

### Requirement: `mm run` prints ranked proposals with no flags
Running `mm run` with no flags SHALL mine and score candidates from the
current repository's `.mm/events/` (same defaults as `mm candidates`:
`--min-score 0.8`, overridable via `--min-score <n>`), render each surviving
candidate as a proposal (same rendering as `mm propose`), print each to
stdout prefixed with its zero-based index, and exit 0. It SHALL write nothing
to disk.

#### Scenario: no candidates clear the score gate
- **WHEN** `mm run` is invoked in a repository whose `.mm/events/` has no
  pattern scoring at or above the threshold
- **THEN** it prints nothing and exits 0

#### Scenario: candidates are printed with an index
- **WHEN** `mm run` is invoked in a repository with two candidates above the
  threshold
- **THEN** it prints two proposals to stdout, each prefixed with `[0]` and
  `[1]` respectively, and exits 0
- **AND** no file under `.mm/proposals/`, `.mm/hooks/`, or
  `.claude/settings.json` is created or modified

### Requirement: `--build <n> --command` renders a hook fragment without installing it
Running `mm run --build <n> --command "<cmd>"` SHALL re-run the same
candidate mining as the no-flag form, select the candidate at index `n`, and
build a hook fragment from it using the supplied command, printing the
resulting fragment JSON to stdout and exiting 0. It SHALL NOT modify
`.claude/settings.json`.

#### Scenario: valid index and command build a fragment
- **WHEN** `mm run --build 0 --command "pnpm test"` is invoked and index `0`
  is a `hook`-target candidate
- **THEN** the built hook fragment JSON is printed to stdout
- **AND** `.claude/settings.json` is unchanged

#### Scenario: index out of range fails
- **WHEN** `mm run --build 5 --command "pnpm test"` is invoked and fewer than
  6 candidates were mined
- **THEN** it exits 1 with an error naming the out-of-range index
- **AND** nothing is printed to stdout and no file is written

#### Scenario: slash-command target is rejected
- **WHEN** the candidate at the selected index has target `slash-command`
- **THEN** it exits 1 with the same rejection message `mm build` itself
  produces for a slash-command proposal
- **AND** no fragment is printed or written

#### Scenario: missing `--command` fails
- **WHEN** `mm run --build 0` is invoked without `--command`
- **THEN** it exits 1 with an error stating `--command` is required
- **AND** nothing is built or printed

### Requirement: `--install` installs the built fragment
Running `mm run --build <n> --command "<cmd>" --install` SHALL perform the
same build as `--build`/`--command` alone, then install the resulting
fragment into `.claude/settings.json` in the current working directory using
the same merge behaviour as `mm-install install`, printing the installed
hook's id to stdout and exiting 0.

#### Scenario: build and install in one command
- **WHEN** `mm run --build 0 --command "pnpm test" --install` is invoked and
  index `0` is a valid `hook`-target candidate
- **THEN** `.claude/settings.json` gains an entry for the built hook, guarded
  the same way `mm-install install` guards it
- **AND** the installed hook's id is printed to stdout
- **AND** the exit code is 0

#### Scenario: `--install` without `--build` is rejected
- **WHEN** `mm run --install` is invoked without `--build <n>`
- **THEN** it exits 1 with an error stating `--install` requires `--build`
- **AND** `.claude/settings.json` is unchanged
