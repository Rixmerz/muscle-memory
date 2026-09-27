# muscle-memory

Compiles repeated agent behaviour into executable automation.

Claude Code repeats sequences: edit a Java file, run the formatter, run the test.
`muscle-memory` observes those sequences through hooks, mines them into patterns,
and — only when hard gates pass and a human approves — compiles them into a hook,
a slash command, or an MCP tool.

## Status

M1: the event logger ships. M2: `mm candidates` reads the recorded events and
prints the sequences that clear the score gate — it mines and ranks, but
nothing is compiled or installed yet. M3: `mm propose` turns a scored
candidate into a markdown proposal — what the pattern is, why it scored the
way it did, and what kind of automation it would become — without writing
any automation. M4: `mm build` compiles a `hook`-target proposal into a
`PostToolUse` fragment, never touching `.claude/settings.json`. M5: `mm-install`
merges a built fragment into `.claude/settings.json` behind a guard, or removes
it — the kill switch. M6: `mm run` orchestrates M2-M5 in one command — mine,
propose, and, behind `--build`/`--install` flags, build and install — instead
of chaining four CLIs by hand. M7: a `SessionEnd` hook mines candidates and
flags new ones in `.mm/review-pending.json`; `/mm:review` judges each through
a read-only `learning-agent` subagent and prints the exact `mm run --build …
--install` command for the ones it recommends — it never builds or installs
anything itself. M8: `mm-classifier` and the `classifier` skill create
classification flows — small typed decisions answered by a local
[Laya](https://github.com/NandhaKishorM/laya) model — that a hook or any
other flow can call. Approval is still the default: no hook, no agent, and no
command in this plugin installs a fragment without a human running `mm-install`
(or `mm run --install`) themselves. The plugin only records, and only where
you asked it to.

## Install

```sh
claude plugin marketplace add Rixmerz/muscle-memory
claude plugin install muscle-memory
```

Installing records nothing. The hooks are live in every session, and they exit
immediately in every repository that has no `.mm/` directory. Recording starts
in one repository at a time:

```sh
/mm:enable      # creates .mm/ here, and gitignores it
```

Stop recording by deleting the directory — `rm -rf .mm` revokes the consent and
the data in one step.

## Flow

What is automatic and what needs a human, step by step:

1. **`/mm:enable`** — once per repo. Creates `.mm/`, gitignores it. This is the
   only consent step.
2. **Recording** — automatic from here on. Every tool call appends a record to
   `.mm/events/`. No action needed.
3. **Mining** — automatic. A `SessionEnd` hook (`mm-nudge.mjs`) mines
   candidates when a session ends. If the candidate set changed since last
   time, it writes `.mm/review-pending.json`. Nothing is built or installed.
4. **`/mm:review`** — you run this. It mines the same candidates and dispatches
   the read-only `learning-agent` subagent to judge each one (determinism,
   safety, lifecycle fit, value). For each `recommend` it prints the exact
   `mm run --build <n> --command "<cmd>" --install` command — it never runs it.
5. **You run that command** — the only step that writes to
   `.claude/settings.json`. This is the approval gate: no hook, no agent, and
   no command in this plugin installs a fragment on its own.
6. **`/mm:status`** — anytime, to see what's recorded, what's pending review,
   and any installed hook's health (`consecutiveFailures`, `disabledAt` if it
   self-demoted after 3 failures).

### What a record contains

One line per tool call, in `.mm/events/YYYY-MM-DD.ndjson`:

```json
{"v":1,"ts":"2026-09-22T14:11:00.777Z","session":"a4edc520-…","cwd":"/Users/you/repo",
 "event":"PreToolUse","tool":"Bash","sig":"bash:pnpm-test","arg":"aca635aaebec"}
```

`sig` is a normalised, low-cardinality shape of the call — the verb and the kind
of thing it acted on. `arg` is a hash. Neither the arguments, the file contents,
the command output, nor your prompts are written anywhere: the miner needs to
know *that* you ran the formatter after editing a Java file, not what was in it.

## Classification flows

Some decisions an agent makes are a small closed question: is this command
destructive, is this prompt a bug report or a question, does this need a
human. `mm-classifier` turns such a question into one JSON file — Laya's own
`choice` / `score` / `noul` questions plus a rule mapping the answer to an
outcome — and answers it in about a second on CPU, without LLM reasoning.

```sh
node plugin/bin/mm-classifier.mjs setup                 # venv + CPU torch + laya[serve] + checkpoints
node plugin/bin/mm-classifier.mjs server start          # local laya-serve, 127.0.0.1, CPU
node plugin/bin/mm-classifier.mjs new triage --store mm < triage.json   # or --out classifiers/
node plugin/bin/mm-classifier.mjs test triage           # the definition's own examples
echo '{"prompt":"the build is broken"}' | node plugin/bin/mm-classifier.mjs run triage
```

- **Where it is stored is always asked.** `new` refuses without `--store mm`
  (`.mm/classifiers/`, local and gitignored; needs `/mm:enable` first) or
  `--out <path>` (anywhere, e.g. a committed directory).
- **Rules first, Laya for the rest.** Ordered regex `rules` on any field
  decide without a model call; `decide.next` chains classifiers (sender →
  bank → kind of notice). On a real 300-email inbox, rules decided 286.
- **Any flow can call it.** `run` prints one decision JSON (`outcome`,
  `reason`, `label`, `confidence`, every answer); branch on `outcome`.
- **Hooks are one consumer, wired by hand.** `hook` speaks Claude Code hook
  JSON (`allow`/`ask`/`deny`/`block` outcomes) and fails open;
  `hook-fragment` prints the `settings.json` entry and writes nothing.
- **Laya reads text; it does not know the world.** Its own vendor ships it
  as a base to specialise, not a zero-shot engine. `new` and `test` warn
  about its documented pitfalls, and `test` reports rule and Laya accuracy
  separately. The skill's `references/laya.md` has the details.
- **Laya is a Python dependency** installed per user, not per repo, by
  `setup`: `~/.local/share/muscle-memory/laya` (`MM_LAYA_PYTHON` overrides),
  ~1 GB plus ~800 MB per checkpoint. The `classifier` skill walks the agent
  through installing it, writing a
  definition, asking where to store it, testing, and wiring it.

Measured on a Ryzen 7 4800H, CPU only: ~0.6–0.9 s per warm decision, ~2 GB
resident, 5/5 on a natural-language triage flow (English and Spanish), and no
better than 3/4 on bare shell commands — Laya is a decision signal for text,
not a parser.

## Principles

- **Observe first, install last.** The logger and the aggregator ship before the
  builder. If the miner finds no pattern that clears the gates on real history,
  the rest is not built.
- **Gates are boolean, the score only ranks.** A weighted product lets a large
  sample size compensate low confidence; separate the two.
- **Approval is the default, automation is opt-in.** This writes self-executing
  code into settings. A kill switch, git-versioned artifacts, and automatic
  demotion are requirements, not polish.

## Packages

| Package | Role |
|---|---|
| `@muscle-memory/core` | event types, signature normalisation, scoring, gates |
| `@muscle-memory/logger` | the hook binary: stdin JSON → append NDJSON, never blocks |
| `@muscle-memory/aggregator` | `mm candidates`: reads `.mm/events/`, mines and scores patterns, prints — never writes |
| `@muscle-memory/learner` | `mm propose`: turns a scored candidate into a markdown proposal, optionally persisted to `.mm/proposals/` |
| `@muscle-memory/builder` | `mm build`: compiles a `hook`-target proposal into a `PostToolUse` fragment, optionally persisted to `.mm/hooks/` — never writes `.claude/settings.json` |
| `@muscle-memory/installer` | `mm-install`: merges a built fragment into `.claude/settings.json` behind a guard, or removes it (`install` / `uninstall`) |
| `@muscle-memory/cli` | `mm run`: orchestrates the four packages above in one command — mine and print by default, `--build <n> --command` to compile, `--install` to install |
| `@muscle-memory/classifier` | `mm-classifier`: create, test and run Laya-backed classification flows, adapt them to hooks, manage the local Laya server |

`plugin/` is the Claude Code plugin itself — manifest, hooks, commands,
skills, and committed bundles in `plugin/bin/` (`mm-log.mjs`, `mm-nudge.mjs`,
`mm-classifier.mjs`). A plugin install copies files and runs no package
manager, so those bundles are the delivery mechanism; `pnpm bundle`
regenerates them, and the test suite fails if the committed logger or
classifier bundle differs from a fresh build (`mm-nudge.mjs` has no such
check yet).

## Development

```sh
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm bundle    # after any change under packages/mm-logger

pnpm --filter @muscle-memory/logger bench    # the 30 ms hook budget
```

pnpm only. Never npm.
