## Why

An agent spends full LLM reasoning, or a tool call, on decisions that are
really a small structured question: "is this command destructive?", "which of
these three paths does this prompt belong to?", "does this need a human?".
[Laya](https://github.com/NandhaKishorM/laya) answers exactly that kind of
question — typed `choice` / `score` / `noul` decisions in one non-autoregressive
forward pass — but using it today means hand-writing Laya question JSON,
running a Python server, and parsing its output in every place that needs a
decision. muscle-memory already turns repeated agent behaviour into
automation; a classification step is the missing building block that both a
hook and any other flow (a script, a CI step, another agent) can call.

## What Changes

- New package `@muscle-memory/classifier` with a CLI, `mm-classifier`, bundled
  into the plugin as `plugin/bin/mm-classifier.mjs`:
  - `new <name>` — validates a classifier definition read from stdin and
    writes it. The caller MUST say where: `--store mm` (into
    `.mm/classifiers/`) or `--out <path>`. With neither, it refuses and says
    what to ask the user.
  - `list` — lists the classifiers stored in `.mm/classifiers/`.
  - `run <name|path>` — reads a JSON input from stdin, asks Laya, applies the
    classifier's thresholds, and prints one decision JSON (`outcome`,
    `reason`, the deciding answer and all answers).
  - `test <name|path>` — runs the classifier's own labelled examples and
    reports accuracy; exits non-zero below `--min-accuracy`.
  - `hook <name|path>` — the same decision, read from and written back in
    Claude Code hook JSON. Fails open when Laya is unreachable.
  - `hook-fragment <name|path> --event <E> [--matcher <M>]` — prints the
    `settings.json` fragment that wires a classifier into a hook. Never
    writes `settings.json`.
  - `setup` — installs Laya into a per-user virtualenv (CPU torch by
    default) and downloads its checkpoints; idempotent.
  - `server start|stop|status` — starts a resident `laya-serve` on
    `127.0.0.1`, CPU by default, stops it, or reports what is missing.
- A classifier definition format: one JSON file holding Laya's own
  `questions` verbatim, an input mapping, a decision rule (which question
  decides, a confidence floor, label → outcome routes, a fallback outcome)
  and labelled examples.
- A plugin skill, `classifier`, that walks the agent through: checking the
  environment, installing Laya into a per-user virtualenv, writing a
  classifier, **asking the user where to store it**, testing it on real
  examples, and connecting it to a hook or any other flow.
- README section and CHANGELOG entry; plugin version bumped to 0.9.0 (also
  fixes `plugin.json` still saying 0.7.0 while the CHANGELOG says 0.8.0).

Nothing here installs a hook. Creating or running a classifier never touches
`.claude/settings.json`; wiring one in stays a human step, same boundary
M5/M6 established.

## Capabilities

### New Capabilities
- `classifier-flows`: defining, storing, running, testing, and hook-adapting
  Laya-backed classification flows, and the resident Laya server they call.

### Modified Capabilities
<!-- none -->

## Impact

- New workspace package `packages/mm-classifier`, a new reference in the root
  `tsconfig.json`, and a second esbuild entry in the root `bundle` script.
- New committed bundle `plugin/bin/mm-classifier.mjs` and new skill
  `plugin/skills/classifier/SKILL.md`.
- Runtime dependency outside Node: Python ≥ 3.10 with `laya[serve]` in a
  virtualenv (default `~/.local/share/muscle-memory/laya`, override with
  `MM_LAYA_PYTHON`). Checkpoints download from Hugging Face on first predict.
  Not needed to build or test the repo — the test suite mocks the HTTP
  backend.
- No change to the logger, the miner, the builder or the installer.
