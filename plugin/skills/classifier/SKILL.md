---
name: classifier
description: Create, test and connect a classification flow — a small typed decision (choice, score, or yes/no probability) answered by a local Laya model instead of full LLM reasoning. Use when a task contains a decision that fits a short structured question: routing, triage, a guardrail before a tool call, a confidence check, picking one of a few predefined paths, or deciding whether to escalate to a human. Also use when the user mentions Laya, a "classifier", a "classification flow", "System 1", or wants a hook or script to decide something on its own.
---

# Classification flows with Laya

A classification flow is one JSON file: Laya's own questions, plus a rule
that turns the answer into an **outcome**. `mm-classifier` creates it, tests
it, runs it on any JSON input, and adapts it to Claude Code hooks. The same
file serves a hook, a shell pipeline, CI, or another agent.

Laya is a **decision signal, not a second LLM**, and it **answers what the
text says, not what the world knows**: an encoder reads the instructions,
the options and the state, and nothing else. Before writing any question,
read `references/laya.md` in this skill — the input format, the vendor's
own accuracy ceilings, the documented pitfalls and the measured
workarounds. The short version: zero-shot, Laya lands around 50% on a
custom 10-category schema (the vendor's own figure), so it is a component
of a flow, not the whole flow.

## 0. Find the binary

Every command below is `node "$MMC" …`. Resolve `$MMC` once and reuse the
absolute path (each Bash call is a fresh shell):

```bash
MMC="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/bin/mm-classifier.mjs}"
[ -f "$MMC" ] || MMC="$(ls ~/.claude/plugins/cache/*/muscle-memory/*/bin/mm-classifier.mjs 2>/dev/null | sort -V | tail -1)"
echo "$MMC"
```

Inside the muscle-memory repo itself, it is `plugin/bin/mm-classifier.mjs`.

## 1. Check the environment

```bash
node "$MMC" server status
```

It prints the Python interpreter (default
`~/.local/share/muscle-memory/laya/bin/python`, override `MM_LAYA_PYTHON`),
the installed Laya version, and whether the server answers at
`MM_LAYA_URL` (default `http://127.0.0.1:8177`). Report only what it says;
do not claim Laya is installed on any other evidence.

## 2. Install Laya (only if missing, only after the user agrees)

The virtualenv takes ~1 GB on disk (CPU torch included), and the first
start downloads the ~800 MB `english` checkpoint from Hugging Face. The
first non-English input routes to the `multilingual` checkpoint: another
~700 MB download and ~20 s the first time. The running server holds ~2 GB
of RAM. Say so and ask before
running. Requires Python ≥ 3.10; Python 3.12 is the tested one.

```bash
node "$MMC" setup          # add --no-download to skip the checkpoints
```

It creates the virtualenv (with `uv` when present, which also fetches
Python 3.12 if the system one is too new for torch; else `python3 -m venv`),
installs CPU torch and `laya[serve]`, checks the import, and downloads the
checkpoints named in `MM_LAYA_MODELS` (default `english`). Running it again
is safe. It streams pip's output; let it finish. The CPU torch build is
deliberate: the server
stays resident, and a resident CUDA context keeps a laptop's discrete GPU
awake (no runtime power-down, and it can break suspend). Use a GPU only if
the user asks for it (`MM_LAYA_DEVICE=cuda` plus a CUDA torch build).

Then start the server. The first start loads a checkpoint (~30 s, longer on
first download); after that a prediction takes ~1 s on CPU:

```bash
node "$MMC" server start      # binds 127.0.0.1 only; stop with: server stop
```

If the flow will see non-English text (a Spanish-speaking user's prompts,
for instance), preload both checkpoints so the first such input does not
wait ~20 s: `MM_LAYA_MODELS=english,multilingual node "$MMC" server start`
(~700 MB more RAM). A hook gives up after 8 s and lets the call through, so
without the preload the first non-English prompt goes unclassified.

## 3. Write the definition

### First: can the label be read off the text?

Ask of every label: *could a person decide it from this text alone, without
knowing who the sender is or anything about the world?*

- **No** — "is `bancochile.cl` a bank", "is this my employer", "which
  project is this client" — Laya cannot do it (domain-only questions scored
  9–27%). Use `rules`, a chain, or escalate to the agent.
- **Yes** — "does this ask me to do something before a date", "is this a
  newsletter or a receipt", "is this prompt a bug report or a question" —
  write a canonical question, below, and measure it.

### Rules first, and chains

Whatever a field decides — a sender domain, a subject keyword — goes in
`rules`, ahead of Laya. A hit decides with certainty, costs no model call,
and needs no server. Every pattern in `match` must hit (case-insensitive,
keys are state keys); the first matching rule wins; `label` must be a label
of the deciding question.

```json
"rules": [
  { "match": { "from": "@(inacap\\.cl|inacapmail\\.cl)>?$" }, "label": "inacap" },
  { "match": { "from": "bancochile\\.cl>?$", "subject": "transferencia" }, "label": "banco" }
]
```

Split a wide question into narrow ones with `decide.next`: a label maps to
another classifier (a sibling name, or a path relative to this file) that
decides the same input, and its outcome becomes the final one — e.g.
`gmail-inbox` (who sent it) → `bank-name` (which bank) → `bank-type`
(sent, received, payment…). Chains stop on a low-confidence label and are
limited to 5 levels. On a real 300-email inbox, rules decided 286.

### The canonical question

```json
{
  "description": "Is an email bulk mail, a transactional notice, or personal?",
  "input": { "from": "from", "subject": "subject", "body": "snippet" },
  "questions": {
    "kind": {
      "type": "choice",
      "instructions": "What kind of email is in `body`?",
      "criteria": {
        "bulk": "newsletter, digest or marketing sent to many people",
        "transactional": "receipt, notice or alert about the recipient's own account",
        "personal": "written by a person to the recipient",
        "other": "none of the other options fits"
      }
    }
  },
  "decide": { "question": "kind", "minConfidence": 0.6,
              "routes": { "bulk": "archive", "personal": "reply" }, "fallback": "review" },
  "examples": [ { "input": { "from": "…", "subject": "…", "snippet": "…" }, "expect": "bulk" } ]
}
```

- **State**: map the input onto the keys Laya's presets use — `body` for
  the text (`subject`, `from` alongside for email; `message`, `prompt`,
  `post` or `request` elsewhere) — and **name that key in backticks** in
  `instructions`, as one question ending in `?`.
- **`choice` first.** 2–10 semantic labels with short noun-phrase glosses,
  plus `other`. Never `true`/`false`/`yes`/`no` as labels. Instructions and
  all glosses share ~190 tokens (English checkpoint); past that Laya cuts
  them silently.
- **Avoid `noul`** unless measured: it follows its own `false:`/`true:`
  labels (#156). The shipped `is_spam` preset scored 19% on a real inbox;
  a 3-option semantic `choice` asking the same thing scored 73%. If you
  need a `noul`, give it `criteria` and `"labels": {"true": "A", "false": "B"}`.
- **Avoid `score`** — the weakest primitive, and biased on `multilingual`.
- Leave `model` out: the Router sends Spanish to `multilingual` and English
  to `english`, and `english` fails silently outside English.
- **Confidence** is Laya's `answer_confidence`, the calibrated field — but
  `multilingual` ships uncalibrated and put wrong labels at 0.95–1.00 on
  Spanish mail. `minConfidence` is a policy you set from `test`, not a
  safety net. Never use `action.act_probability` (#185): it is always ~1.
- `decide`: the **label** is the chosen choice key, `"true"`/`"false"` for a
  noul (P(true) ≥ `threshold`, default 0.5), or the option at the rounded
  score. Below `minConfidence` → `fallback` (`low-confidence`); else
  `routes[label]` (`routed`), or `fallback` when unrouted. Outcomes are free
  strings; only `allow`, `ask`, `deny` and `block` mean something to a hook.
- **Examples** are for `test` only — Laya has no few-shot slot. Write real
  ones from this project, at least one per label, tricky ones included.
- `new` prints lint warnings for the pitfalls above. Fix them or say why not.

### When zero-shot is not enough

The accuracy is in specialisation, not in wording: train a small head on
Laya's frozen encoder from a few hundred labelled rows, or fine-tune.
`mm-classifier` does not do this yet; say so rather than tuning wording
past the point of returns. `references/laya.md` §5 has the options.

## 4. Ask where to store it — always

`new` refuses to write until told where, and so must you. Ask the user with
these two options, and say the git consequence of each:

- **In muscle-memory** — `--store mm` → `.mm/classifiers/<name>.json`.
  Local to this machine, gitignored, never committed. Needs `.mm/` to
  exist; if it does not, `/mm:enable` creates it, and that **also turns on
  event recording** for this repo, so say that before suggesting it.
- **Another path** — `--out <dir or file.json>`, e.g. `classifiers/` to
  commit it with the project, or a shared directory used by several repos.

```bash
node "$MMC" new bash-destructive --store mm < /tmp/def.json
node "$MMC" new bash-destructive --out classifiers/ < /tmp/def.json
```

`<name>` is kebab-case and becomes the file name. `--force` overwrites.
Later commands take the name (resolved in `.mm/classifiers/`) or any path.

## 5. Test it before anyone relies on it

```bash
node "$MMC" test bash-destructive                      # default --min-accuracy 1.0
echo '{"tool_input":{"command":"git push --force"}}' | node "$MMC" run bash-destructive
```

Show the user each example's expected label, the actual label, whether
a rule or Laya decided it, the confidence and the outcome. `test` prints
accuracy split into rules and Laya: a hybrid definition whose examples are
all rule hits says nothing about the Laya half, so add examples that no
rule covers. If Laya's accuracy is short, apply §3 first, then say plainly
that zero-shot has hit its ceiling — do not lower `--min-accuracy` just to
pass. Exit 3 means the server is down.

## 6. Connect it

**Any flow** — `run` prints one JSON decision (`outcome`, `reason`,
`label`, `confidence`, every answer, `model`); branch on `outcome`:

```bash
outcome=$(printf '%s' "$payload" | node "$MMC" run triage | jq -r .outcome)
```

**A hook** — print the wiring, show it to the user, and let them add it to
`.claude/settings.json` (or ask you to); never edit settings unasked:

```bash
node "$MMC" hook-fragment bash-destructive --event PreToolUse --matcher Bash
```

Say these three things when proposing a hook:

- It **fails open**: if the server is down or the classifier is broken, the
  tool call proceeds. The hook never starts the server.
- It adds ~1 s to every matching call, so keep the matcher narrow (`Bash`,
  not `*`).
- The command holds the plugin's absolute path, which changes on plugin
  updates; re-run `hook-fragment` after one.

## 7. Report

End with: Laya version and interpreter, where the classifier was stored and
whether it will be committed, the `test` accuracy, what it is connected to
(or that it is not connected yet), and any limitation seen — low
confidences, a fallback-heavy test, the server not running.

## Commands

| Command | Does |
| --- | --- |
| `new <name> (--store mm \| --out <path>) [--force]` | validate stdin, save |
| (definition) `rules`, `decide.next` | deterministic labels first; chain classifiers |
| `list` | classifiers in `.mm/classifiers/` |
| `run <name\|path>` | stdin JSON → decision JSON |
| `test <name\|path> [--min-accuracy n]` | run the examples, exit 1 below the floor |
| `hook <name\|path>` | hook payload → hook JSON, always exit 0 |
| `hook-fragment <name\|path> --event E [--matcher M]` | print settings wiring |
| `server start [--wait s] \| stop \| status` | the local Laya server |
| `setup [--no-download]` | install Laya and its checkpoints |
