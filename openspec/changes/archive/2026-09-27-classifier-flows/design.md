## Context

See proposal.md for motivation. Constraints that shape the approach:

- muscle-memory is Node ≥ 22 / TypeScript; Laya is Python ≥ 3.10 + torch.
  Measured on the development machine (Ryzen 7 4800H, CPU only, Laya 0.3.20,
  torch 2.14+cpu, Python 3.12): **cold load 28 s** (17 s of it the first
  checkpoint download), **~0.9 s** per warm three-question predict.
- Plugin hooks run with a 5 s timeout. A per-call Python spawn cannot fit;
  only a resident server can.
- A plugin install copies files and runs no package manager, so anything the
  plugin executes ships as a committed esbuild bundle in `plugin/bin/`.
- `.mm/` is gitignored and its existence is the recording consent
  (`plugin-distribution`).
- Zero-shot Laya is noisy on terse inputs: in the same run `ls -la` came back
  `destructive` with confidence 0.01. A classifier is only as good as its
  thresholds and its tested examples.

## Goals / Non-Goals

**Goals:**
- One call, one typed decision, usable from a hook, a shell pipeline, or
  another agent.
- The storage decision is always the user's, and the git consequence is
  visible when it is made.

**Non-Goals:**
- Composing classifiers into graphs. Several questions in one definition
  already answer in one forward pass; chaining is shell piping.
- Installing hooks. `hook-fragment` prints; the human pastes or runs
  `mm-install`-style tooling.
- Running Laya on a GPU by default.

## Decisions

**New package `@muscle-memory/classifier`, own bin `mm-classifier`.**
`mm` (`@muscle-memory/cli`) is a single-purpose parser for `mm run`; bolting
subcommands onto it would change its contract. Alternative considered:
extending `mm build` — rejected, it only compiles `PostToolUse`/`Bash`
fragments from mined candidates, a different input entirely.

**HTTP to `laya-serve`, never an in-process or per-call Python spawn.**
`POST /v1/systemone` and `GET /health` are Laya's own server surface, so
there is no Python code of ours to ship. Node's built-in `fetch` keeps the
bundle builtin-only. Alternative: the `laya-mcp-server` — rejected, a hook
cannot speak MCP and the agent can call the CLI through Bash anyway.

**`127.0.0.1`, port 8177, CPU, `english` preloaded.** `laya-serve` defaults
to `0.0.0.0`, which would expose an unauthenticated decision endpoint on the
LAN. CPU is the only safe default for a resident process on hybrid-GPU
laptops (a resident CUDA context pins the dGPU awake); `CUDA_VISIBLE_DEVICES`
is emptied when the device is `cpu` so a CUDA torch build cannot touch it
either. `english` alone keeps resident memory to one checkpoint; the Router
still loads `multilingual` lazily for non-English text.

**`setup` installs, it does not just advise.** A plugin user should not
have to paste three `uv` commands. `setup` prefers `uv` because it fetches
a managed Python 3.12 when the system Python is newer than torch's wheels
(this machine runs 3.14), falls back to `python3 -m venv` + pip, and is
idempotent. It downloads the checkpoints too, so the first `server start`
does not stall on a gigabyte download. The skill still asks the user before
running it.

**Laya is a text reader, not a knowledge source.** It sees only
instructions, options and state (no retrieval), and its vendor calls it "a
fast base to specialise, not a zero-shot decision engine": base checkpoints
score 0.50–0.52 on a 10-way triage that was in their training mix, and
below the majority-class baseline on typed decisions. So the definition
format leads with rules and chains, `new`/`test` lint the pitfalls the
vendor documents, and `test` reports the Laya half on its own.

**Rules first, Laya for the residual.** Measured on a real inbox, a label
that is decidable from a field (sender domain, subject keyword) is decided
correctly by a regex and wrongly by Laya surprisingly often. So a definition
carries ordered `rules`; a hit costs no model call and needs no server, and
only what no rule covers reaches Laya.

**`decide.next` instead of one wide question.** "Which sender" → "which
bank" → "what kind of bank notice" is three narrow decisions, each with its
own rules and outcomes, rather than one question with dozens of labels. A
`next` name resolves next to the definition, not the cwd, so a directory of
chained classifiers can be moved or committed as a unit.

**Per-user virtualenv at `~/.local/share/muscle-memory/laya`.** Checkpoints
and torch are GB-scale; per-repo copies would duplicate them. Overridable
with `MM_LAYA_PYTHON`.

**Definition = Laya's questions verbatim + a thin `decide` block.** No
second question language to learn or translate; anything Laya's docs show
pastes in. `decide` holds only what Laya does not: which answer decides, the
confidence floor, label → outcome routes, and the fallback. Outcomes are
free strings; only `allow`/`ask`/`deny`/`block` mean something to the hook
adapter, so non-hook consumers pick their own vocabulary.

**`answer_confidence` is the confidence.** Laya's `confidence` field is a
calibrated margin (0.0097 for a 0.40/0.33/0.28 split) — useful, but it
reads as "wrong" to a user writing a threshold. The probability of the
chosen answer is what `minConfidence: 0.6` intuitively means.

**`--store mm` refuses without `.mm/`.** Creating the directory is the
logger's consent signal; a classifier write must not flip recording on as a
side effect.

**Hook adapter fails open, exits 0.** Same stance as the logger: a broken
optional component must never block the agent. A guard that fails closed
would make a stopped server stop all Bash calls. The skill tells the agent
to say this plainly when wiring a guard.

## Risks / Trade-offs

- [Plugin updates move the bundle path, so a pasted hook fragment goes
  stale] → the hook then errors non-blocking (fail-open), and the skill says
  to re-run `hook-fragment` after a plugin update.
- [Zero-shot accuracy is low on short inputs] → `test` defaults to
  `--min-accuracy 1.0` and refuses definitions without examples; the skill
  requires a passing `test` before wiring.
- [A 0.9 s warm predict adds latency to every matched tool call] → the skill
  steers guards to narrow matchers (`Bash`, not `*`).
- [The first non-English input loads the `multilingual` checkpoint lazily,
  ~20 s, past the hook's 10 s timeout] → `hook` caps its request at 8 s so
  that input fails open instead of being killed; the skill tells
  non-English users to preload with `MM_LAYA_MODELS=english,multilingual`.
- [Laya's confidence is not calibrated on this kind of input: wrong labels
  came back at 0.95–1.00, so `minConfidence` does not filter them] → the
  skill requires `test` on real examples and tells the agent to prefer a
  rule whenever the label is decidable from a field.
- [The server holds ~2 GB RAM while running] → `server stop`; the server is
  never started by a hook, only by an explicit command.

## Migration Plan

Additive. Rollback: delete `packages/mm-classifier`,
`plugin/bin/mm-classifier.mjs` and `plugin/skills/classifier/`, and drop the
second esbuild entry from the root `bundle` script.

## Verification (2026-09-26)

Live run, Laya 0.3.20 on CPU (Ryzen 7 4800H), through the committed bundle:

- `server start` with the checkpoint cached: 6 s to healthy; RSS 1.98 GB,
  2.15 GB after the `multilingual` checkpoint loaded; listening on
  `127.0.0.1:8177` only; no `/dev/nvidia*` descriptors.
- `new` without a storage option and `--store mm` without `.mm/` both exit 1
  and write nothing; with `.mm/` present it writes
  `.mm/classifiers/bash-destructive.json`.
- `hook` on a `PreToolUse` `rm -rf build/`: `permissionDecision: "ask"` in
  0.64 s end to end; `ls -la`: no output, exit 0.
- A noul flow over bare shell commands: 3/4 in three wordings, never 4/4
  (`git push --force` read as harmless at 0.54). A choice flow triaging
  natural-language prompts: 5/5 at 0.85–1.00, two of them in Spanish; the
  first Spanish input took ~20 s while `multilingual` loaded.

Gmail primary inbox, 300 emails read through rastro:

- One Laya-only question over four categories: 27/50 at best (English
  criteria); Spanish criteria 21/50; errors at 0.99–1.00 confidence.
  Narrower per-group questions: bank notice type 23/42, INACAP topic 31/44.
- Five chained classifiers (sender → bank → notice type, INACAP topic,
  Assetplan topic) with rules first: 286/300 decided by rules, 14 reached
  Laya, 300 emails in ~23 s end to end.
- Canonical form, same data: state `{from, subject, body}`, instructions
  naming `` `body` ``, a catch-all, ≤10 options. The Laya half decided 3 of
  the 8 distinct emails no rule covers; the 4 low-confidence ones fell to
  `revisar` instead of a wrong label.
- Laya's email `is_spam` preset (a `noul`) on newsletters vs transactional
  mail: 19% (inverted, Laya #156). With `labels` A/B 61–63%; a 3-option
  semantic `choice` asking the same thing 70–73%.
- Domain-only questions ("what kind of organisation sends mail from
  `domain`"): 9–27% on 8 categories — no world knowledge.
