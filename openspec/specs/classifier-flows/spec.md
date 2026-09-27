# classifier-flows Specification

## Purpose
Let an agent define small, typed classification decisions once — backed by a
local Laya model — and call them from a Claude Code hook or from any other
flow, instead of spending full LLM reasoning on each one.

## Requirements

### Requirement: A classifier definition SHALL be one validated JSON document
A classifier definition SHALL be a JSON object with: `name` (kebab-case),
`description` (string), `questions` (Laya questions, passed to Laya verbatim),
`decide`, and optionally `input`, `model` and `examples`. Each question SHALL
have `type` `choice`, `score` or `noul` and a string `instructions`. A
`choice` question's `criteria` SHALL be an object with at least two labels; a
`score` question's `criteria` SHALL be an array of at least two strings; a
`noul` question's `criteria`, when present, SHALL have exactly the keys
`true` and `false`, and so SHALL its optional `labels`. A `choice`
question's `criteria` MAY also be a list of labels, and a label's
description MAY be `null`, as Laya accepts both.
`decide.question` SHALL name one of the questions, `decide.fallback` SHALL be
a non-empty string, every key of `decide.routes` SHALL be a label that
question can produce, and `decide.minConfidence` and `decide.threshold`, when
present, SHALL lie in `[0, 1]`. Any violation SHALL be rejected with a
message naming the offending field.

#### Scenario: A valid definition is accepted
- **WHEN** a definition with one `choice` question, a `decide` block routing
  two of its labels, and a `fallback` is validated
- **THEN** validation succeeds

#### Scenario: A malformed noul question is rejected
- **WHEN** a `noul` question's criteria has keys `yes` and `no`
- **THEN** validation fails with a message naming that question's `criteria`

#### Scenario: A route to a label the question cannot produce is rejected
- **WHEN** `decide.routes` has a key that is not one of the deciding
  question's labels
- **THEN** validation fails with a message naming that route key

### Requirement: Rules SHALL decide before Laya when they match
A definition MAY carry `rules`: an ordered array of `{match, label}`, where
`match` maps a state key or dot path to a regular expression and `label` is
one of the deciding question's labels. A rule hits when every one of its
patterns matches the stringified value (case-insensitive; a missing value is
the empty string). The first hit SHALL decide with that label, confidence 1,
reason `rule`, no answers, and SHALL NOT contact the Laya server. With no
hit, the definition is decided by Laya as before. An empty `match`, an
invalid regular expression, or an unknown label SHALL be rejected at
validation.

#### Scenario: A rule decides without the server
- **WHEN** a rule's `correo` pattern matches the input and no Laya server is
  running
- **THEN** `run` prints the decision with reason `rule` and confidence 1,
  and exits 0

#### Scenario: Every pattern of a rule must match
- **WHEN** a rule matches `correo` but not `asunto`
- **THEN** that rule does not decide and the next rule is tried

#### Scenario: Invalid rule
- **WHEN** a rule names a label the deciding question cannot produce
- **THEN** validation fails naming `rules[<i>].label`

### Requirement: `decide.next` SHALL chain classifiers
`decide.next` MAY map labels to another classifier, by name (a sibling
`<name>.json` in the same directory as the definition) or by a path relative
to that directory. When the decided label has a `next` entry and the reason
is not `low-confidence`, `run` and `hook` SHALL decide the same input with
that classifier and report it as `next` inside the decision, whose
`outcome` becomes the top-level outcome. A chain SHALL be rejected when it
revisits a classifier or grows deeper than 5. `test` SHALL decide only the
classifier under test.

#### Scenario: Three-level chain
- **WHEN** a sender classifier routes `banco` to `bank-name`, and that routes
  `bancochile` to `bank-type`, which labels the email `enviada` routed to
  `registrar-gasto`
- **THEN** the printed decision has label `banco`, `next.label`
  `bancochile`, `next.next.label` `enviada`, and outcome `registrar-gasto`

#### Scenario: Low confidence stops the chain
- **WHEN** the first classifier's label is below its `minConfidence`
- **THEN** no next classifier runs and the outcome is its fallback

#### Scenario: Cycle
- **WHEN** classifier `a` chains to `b` and `b` back to `a`
- **THEN** `run` exits 1 naming the cycle

### Requirement: `new` and `test` SHALL warn about Laya's documented pitfalls
After validating a definition, `new` and `test` SHALL print one stderr line
beginning `warning:` for each of: instructions that name no state field in
backticks, or name one absent from `input`; a `noul` without `labels`; a
`score` question; `choice` labels that are boolean words; more than 10
options (stronger wording above 20); more than 3 options with no catch-all
label; instructions plus options longer than the head budget; and
non-ASCII text on a definition pinned to `model: "english"`. Warnings SHALL
NOT change the exit code.

#### Scenario: Canonical question
- **WHEN** a `choice` question names `` `body` ``, `input` maps `body`, and
  it has 3 semantic labels including `other`
- **THEN** no warning is printed

#### Scenario: Preset-style noul
- **WHEN** `new` saves a `noul` question without `labels`
- **THEN** a warning citing Laya issue #156 is printed and the file is
  still written with exit 0

### Requirement: `test` SHALL report rules and Laya separately
`test` SHALL print, per example, whether a rule or Laya decided it, and a
line `rules <hits>/<n> · laya <hits>/<n>` before the overall accuracy. When
every example was decided by a rule, that line SHALL say the run tells
nothing about Laya.

#### Scenario: All examples are rule hits
- **WHEN** every example of a definition matches a rule
- **THEN** `test` prints `rules n/n · laya 0/0` followed by a note that no
  example reaches Laya

### Requirement: `new` SHALL require an explicit storage choice
`mm-classifier new <name>` SHALL read a definition from stdin, validate it,
and write it only when exactly one of `--store mm` or `--out <path>` is
given. With neither or both, it SHALL exit 1 without writing, and the message
SHALL name both options and state that `.mm/` is gitignored while `--out` can
point at a committed path. `--store mm` SHALL write
`.mm/classifiers/<name>.json` in the current directory and SHALL refuse, exit
1, when `.mm/` does not already exist — creating `.mm/` would switch on event
recording, which only `/mm:enable` may do. `--out` ending in `.json` SHALL be
the file path; any other `--out` SHALL be a directory receiving
`<name>.json`. An existing file SHALL NOT be overwritten unless `--force` is
given. The definition's `name` SHALL be set to `<name>`.

#### Scenario: No storage choice
- **WHEN** `new bash-risk` runs with a valid definition and no `--store` or
  `--out`
- **THEN** it exits 1, writes nothing, and the message names `--store mm` and
  `--out <path>`

#### Scenario: Store in muscle-memory
- **WHEN** `new bash-risk --store mm` runs in a directory that has `.mm/`
- **THEN** `.mm/classifiers/bash-risk.json` exists with the validated
  definition and the path is printed

#### Scenario: Store in muscle-memory before consent
- **WHEN** `new bash-risk --store mm` runs in a directory without `.mm/`
- **THEN** it exits 1, `.mm/` is still absent, and the message points to
  `/mm:enable` or `--out`

#### Scenario: Store at another path
- **WHEN** `new bash-risk --out classifiers/` runs
- **THEN** `classifiers/bash-risk.json` is written

#### Scenario: Existing file
- **WHEN** the target file exists and `--force` is not given
- **THEN** it exits 1 and the file is unchanged

### Requirement: A classifier SHALL be resolvable by name or by path
Wherever a command takes `<name|path>`, an argument containing `/` or ending
in `.json` SHALL be read as a file path; anything else SHALL resolve to
`.mm/classifiers/<name>.json` in the current directory. `list` SHALL print
the name and description of every valid definition in `.mm/classifiers/`,
and report invalid files by path without failing.

#### Scenario: Name resolves into muscle-memory
- **WHEN** `run bash-risk` is invoked and `.mm/classifiers/bash-risk.json`
  exists
- **THEN** that file's definition is used

#### Scenario: Path is used as given
- **WHEN** `run ./classifiers/bash-risk.json` is invoked
- **THEN** that file is used, whether or not `.mm/` exists

### Requirement: `run` SHALL turn one input into one decision
`mm-classifier run <name|path>` SHALL read one JSON value from stdin and
build the Laya state from it: with an `input` mapping (state key → dot path),
each state key takes the value at that path; without one, the whole input is
the state. It SHALL send the state, the definition's `questions` and its
`model` (if any) to the Laya server and derive the decision from the answer
to `decide.question`:

- the **label** is the chosen criteria key for `choice`; `"true"` when the
  `noul` probability is at or above `decide.threshold` (default `0.5`) and
  `"false"` otherwise; and the legend entry at the rounded score for `score`.
- the **confidence** is Laya's `answer_confidence` for `choice` and `score`,
  and the probability of the chosen side for `noul`.
- below `decide.minConfidence` (default `0`), the outcome is
  `decide.fallback` with reason `low-confidence`; otherwise it is
  `decide.routes[label]` with reason `routed`, or `decide.fallback` with
  reason `unrouted` when the label has no route.

It SHALL print one JSON object — `classifier`, `outcome`, `reason`, `label`,
`confidence`, `answers` (every answer Laya returned) and `model` — and exit
0. When the server cannot be reached it SHALL exit 3 with a message naming
`mm-classifier server start`; on any other failure it SHALL exit 1.

#### Scenario: Confident answer is routed
- **WHEN** Laya answers the deciding `choice` question with label
  `destructive` at confidence 0.88, `minConfidence` is 0.6, and `destructive`
  routes to `deny`
- **THEN** the printed decision has `outcome` `deny`, `reason` `routed`,
  `label` `destructive`

#### Scenario: Low confidence falls back
- **WHEN** the answer's confidence is below `minConfidence`
- **THEN** the outcome is `decide.fallback` and `reason` is `low-confidence`

#### Scenario: Noul threshold decides the label
- **WHEN** the deciding question is `noul`, `threshold` is 0.7 and Laya
  returns probability 0.65
- **THEN** the label is `false` with confidence 0.35

#### Scenario: Input mapping selects the state
- **WHEN** `input` is `{"command": "tool_input.command"}` and stdin is
  `{"tool_input": {"command": "ls"}}`
- **THEN** the state sent to Laya is `{"command": "ls"}`

#### Scenario: Server down
- **WHEN** nothing listens at the configured Laya URL
- **THEN** `run` exits 3 and the message names `mm-classifier server start`

### Requirement: `test` SHALL measure a classifier against its own examples
`mm-classifier test <name|path>` SHALL run every entry of `examples`
(`{input, expect}`, `expect` being a label) through the same decision path as
`run`, print each example's expected label, actual label, confidence and
outcome, then the accuracy (matching labels over examples). It SHALL exit 1
when the accuracy is below `--min-accuracy` (default `1.0`) or the definition
has no examples, and 3 when the server cannot be reached.

#### Scenario: All examples match
- **WHEN** every example's label matches its `expect`
- **THEN** accuracy `1.00` is printed and it exits 0

#### Scenario: Accuracy below the floor
- **WHEN** one of four examples mismatches and `--min-accuracy 0.9` is given
- **THEN** accuracy `0.75` is printed and it exits 1

#### Scenario: No examples
- **WHEN** the definition has no `examples`
- **THEN** it exits 1 stating a classifier cannot be trusted untested

### Requirement: `hook` SHALL adapt a decision to Claude Code hook output and fail open
`mm-classifier hook <name|path>` SHALL read a Claude Code hook payload from
stdin and decide on it exactly as `run` does. On a `PreToolUse` payload,
outcomes `allow`, `ask` and `deny` (and `block`, treated as `deny`) SHALL be
printed as `hookSpecificOutput` with that `permissionDecision` and a
`permissionDecisionReason` naming the classifier, label and confidence. On
any other event, `deny` or `block` SHALL be printed as `{"decision":
"block", "reason": …}`. Every other outcome SHALL print nothing. It SHALL
always exit 0: an unreachable server, a missing classifier, or a malformed
payload SHALL print nothing to stdout and one line to stderr, so a broken
classifier never blocks the agent. It SHALL never start the server.

#### Scenario: PreToolUse deny
- **WHEN** a `PreToolUse` payload is classified to outcome `deny`
- **THEN** stdout carries `hookSpecificOutput.permissionDecision` `deny` and
  it exits 0

#### Scenario: Non-hook outcome
- **WHEN** the outcome is `continue`
- **THEN** nothing is printed and it exits 0

#### Scenario: Server unreachable
- **WHEN** the Laya server is down
- **THEN** nothing is printed to stdout, one line goes to stderr, it exits
  0, and no server process is started

### Requirement: `hook-fragment` SHALL print, never install, the hook wiring
`mm-classifier hook-fragment <name|path> --event <E> [--matcher <M>]` SHALL
validate the classifier and print a `{"hooks": {<E>: [...]}}` fragment whose
command runs the bundled `mm-classifier` binary's `hook` subcommand on that
classifier, with `--matcher` defaulting to `*` and a timeout of 10 seconds.
A classifier inside the current directory SHALL be referenced relative to
`$CLAUDE_PROJECT_DIR`. It SHALL NOT read or write `.claude/settings.json`.

#### Scenario: Fragment for a Bash guard
- **WHEN** `hook-fragment bash-risk --event PreToolUse --matcher Bash` runs
- **THEN** a fragment with event `PreToolUse`, matcher `Bash` and a command
  ending in `hook "$CLAUDE_PROJECT_DIR/.mm/classifiers/bash-risk.json"` is
  printed, and `.claude/settings.json` is unchanged

### Requirement: `setup` SHALL install Laya in one command
`mm-classifier setup` SHALL leave an interpreter that already imports Laya
untouched. Otherwise it SHALL create the virtualenv around the configured
interpreter when missing — with `uv venv --python 3.12` when `uv` is
available, else `python3 -m venv` provided `python3` is at least 3.10 —
then install torch (the CPU build from the PyTorch CPU index when the device
is `cpu`) and `laya[serve]`, and verify that Laya imports. Unless
`--no-download` is given, it SHALL then download the checkpoints named in
`MM_LAYA_MODELS`. Any failed step SHALL stop the sequence with exit 1 and a
message naming that step.

#### Scenario: Fresh install with uv
- **WHEN** `setup` runs, `uv` is available and the interpreter does not exist
- **THEN** it creates a Python 3.12 virtualenv, installs CPU torch and
  `laya[serve]`, downloads the configured checkpoints, and prints the Laya
  version

#### Scenario: Already installed
- **WHEN** the interpreter already imports Laya
- **THEN** nothing is installed; only the checkpoint download runs

#### Scenario: No uv and an old Python
- **WHEN** `uv` is missing and `python3` is 3.9
- **THEN** it exits 1 stating Laya needs Python 3.10 or newer, and runs no
  command

#### Scenario: A step fails
- **WHEN** the torch install fails
- **THEN** it exits 1 naming the torch step, and `laya[serve]` is not
  attempted

### Requirement: `server` SHALL manage one local Laya server
The Laya server URL SHALL be `MM_LAYA_URL`, default
`http://127.0.0.1:8177`; the Python interpreter SHALL be `MM_LAYA_PYTHON`,
default `~/.local/share/muscle-memory/laya/bin/python`. `server start` SHALL
do nothing when `/health` already answers; otherwise it SHALL launch
`python -m laya.serve` detached, bound to `127.0.0.1` only, on the URL's
port, with device `MM_LAYA_DEVICE` (default `cpu`) and preloaded checkpoints
`MM_LAYA_MODELS` (default `english`), with CUDA devices hidden when the
device is `cpu`, record its pid, and wait up to `--wait` seconds (default
120) for `/health`, exiting 1 with the log path if it never answers.
`server stop` SHALL terminate the recorded process. `server status` SHALL
report the interpreter path, the installed Laya version or its absence, and
whether the server answers, exiting 0 only when it does.

#### Scenario: Missing interpreter
- **WHEN** `server start` runs and the interpreter does not exist
- **THEN** it exits 1 naming the path and `mm-classifier setup`, and starts
  nothing

#### Scenario: Already running
- **WHEN** `server start` runs and `/health` answers
- **THEN** it prints that the server is already running and exits 0 without
  launching a second one

#### Scenario: Never binds a public interface
- **WHEN** `server start` launches the server
- **THEN** the process environment has `LAYA_HOST=127.0.0.1`
