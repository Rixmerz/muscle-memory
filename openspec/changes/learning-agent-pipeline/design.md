# Design: learning-agent-pipeline

## Pieces added

```
plugin/agents/learning-agent.md     # subagent definition (new)
plugin/commands/review.md           # /mm:review (new)
plugin/hooks/hooks.json             # + SessionEnd nudge entry (extended)
plugin/bin/mm-nudge.mjs             # bundled SessionEnd binary (new)
plugin/commands/status.md           # + review-pending + hook telemetry sections (extended)
```

No new package under `packages/`. Everything here consumes
`@muscle-memory/aggregator`'s `candidates()` (already public via the same
deep-import path `mm-cli` and `mm-learner` use) and `mm-installer`'s existing
`.mm/hooks/<id>.state.json` shape (`GuardState`, already defined in
`packages/mm-installer/src/guard.ts`). Nothing in `packages/` changes.

## Flow

```
SessionEnd
     │
     ▼
mm-nudge.mjs  ── candidates(cwd) ──▶ any ≥ min-score?
     │                                      │
     │ no                                   │ yes, and different from last run
     │                                      ▼
   exit 0                       write .mm/review-pending.json
                                 { ids, count, minedAt }

/mm:status                              /mm:review
     │                                      │
     ▼                                      ▼
reads .mm/review-pending.json      mm run (no --build) → ScoredPattern[]
reads .mm/hooks/*.state.json                │
reports both                                ▼
                                  for each candidate ≥ min-score:
                                  spawn learning-agent(candidate, examples)
                                       │
                                       ▼
                              verdict: recommend | reject | needs-command
                                       │
                                       ▼
                          print verdicts; for `recommend`, print the exact
                          `mm run --build <n> --command "<cmd>" --install`
                          the human would run — never run it
```

## `plugin/bin/mm-nudge.mjs`

Bundled the same way `plugin/bin/mm-log.mjs` is bundled (`pnpm bundle`
regenerates it; the test suite fails if the committed copy and a fresh build
differ — same guarantee M1 established for the logger). Registered as a
`SessionEnd` hook in `hooks.json`, alongside the existing logger entry.

```js
// pseudocode, real file is bundled from packages/mm-aggregator + fs
const root = process.cwd();
if (!existsSync(join(root, ".mm"))) process.exit(0);   // same consent gate as the logger

const results = candidates(root, { minScore: 0.8 });
if (results.length === 0) process.exit(0);

const ids = results.map((c) => deriveCandidateId(c)).sort();
const path = join(root, ".mm", "review-pending.json");
const previous = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
if (previous && arraysEqual(previous.ids, ids)) process.exit(0);   // no new signal, no write

writeFileSync(path, JSON.stringify({ ids, count: ids.length, minedAt: new Date().toISOString() }, null, 2));
process.exit(0);
```

`deriveCandidateId` is a new, small, pure function (steps + occurrences →
stable string) — the only new logic this design adds to the mining path, and
it derives an id, it does not score or filter.

Same consent gate as the logger: absent `.mm/`, this exits immediately. Same
non-blocking guarantee: it only reads `.mm/events/`, a bounded and already
locally-mined data set — no network, no spawning a subagent from inside a
hook (a hook cannot dispatch a `Task` itself; only the plugin's slash commands
and the main agent can).

## `plugin/agents/learning-agent.md`

A subagent definition, shaped like the ones under `.claude/agents/` /
`vise:*` in this environment — frontmatter plus body, no code.

```yaml
---
name: learning-agent
description: Evaluates a mined muscle-memory candidate for safety, determinism, and correct hook placement before a human is asked to build it. Never installs, never edits files.
tools: Read, Grep, Glob, Bash
---
```

Body instructs it, given one `ScoredPattern` (steps, occurrences, score,
example event records already in `.mm/events/`) passed in its prompt:

1. **Determinism beyond the score.** The aggregator's score already weighs
   consistency; the agent's job is to read the actual step signatures
   (`bash:pnpm-test`, `bash:npm-install`, …) and flag the case the numeric
   score cannot see — a retry-after-failure sequence (e.g. `test` →
   `install` → `test`) that repeats because something is flaky, not because
   it is the correct procedure. Reject with reason `false-positive` here.
2. **Safety.** Read the literal command the human would pass to `--command`
   if one is already implied by context (e.g. prior proposal text, session
   transcript excerpts given in the prompt). Flag anything destructive
   (`rm`, `git push --force`, credentials-bearing commands) — `reject`,
   reason `unsafe`.
3. **Lifecycle placement.** Only `PostToolUse`/`Bash` fragments exist today
   (`mm build`'s only supported target). If the pattern's trigger is not a
   tool call at all (e.g. "at session start" or "before a prompt"), say so
   explicitly as a limitation — `needs-command` with that reason, not a
   silent `recommend` for a lifecycle point nothing can build yet.
4. **Value.** Occurrences below 3 sessions / 2 days (the same bar
   `/mm:status` already states as the mining floor) — `reject`, reason
   `low-value`, even if the numeric score cleared the gate on a thin sample.
5. If none of the above reject it, and a command is nameable from the
   evidence — `recommend`, and the verdict includes the literal `mm run
   --build <n> --command "<cmd>" --install` invocation, `<n>` being the
   candidate's index in this `/mm:review` run.

Output format: a JSON object `{ verdict, reason?, command? }` on the last
line of the response, so `/mm:review` can parse it without free-text
scraping.

## `/mm:review`

```
1. Say what this does before running anything: mines the same candidates
   `mm run` would print, asks a read-only subagent to judge each one, and
   prints its verdicts — installs nothing.
2. Run `mm run` (no --build) to get the ranked candidates.
3. No candidates: say so, mention /mm:status's review-pending flag if it was
   what triggered this, and stop.
4. For each candidate, dispatch `learning-agent` with: the candidate's steps,
   occurrences, score, and up to 3 example records from .mm/events/ for that
   signature (read directly — same file `mm candidates` already reads).
5. Print each verdict. For `recommend`, print the exact command to run and
   nothing else — no auto-run.
6. Clear .mm/review-pending.json's flag is NOT this command's job — it
   reflects "unreviewed since last mine", and stays until the underlying
   candidate set changes (mm-nudge.mjs's own equality check), not until
   /mm:review runs. Say this if the file still exists afterward, so the user
   does not read its persistence as review having failed.
```

## `/mm:status` additions

Two new sections, both read-only, both additive to the existing report:

- **Review pending**: if `.mm/review-pending.json` exists, print its `count`
  and `minedAt`, and say `/mm:review` is how to see them judged.
- **Installed hooks**: for each `.mm/hooks/*.install.json`, pair it with the
  matching `*.state.json` if present and report `consecutiveFailures`,
  `lastExitCode`, and `disabledAt` (self-demoted hooks show a non-null
  `disabledAt` — say plainly that muscle-memory turned this off by itself
  after 3 consecutive failures, per `guard.ts`'s existing threshold).

## Out of scope

- No automatic install, ever, from any agent or hook in this milestone.
- No new scoring model — the learning agent's checks are qualitative gates on
  top of the existing numeric score, not a replacement for it.
- No `slash-command`-target evaluation — `mm build` still only compiles
  `hook` targets (M4's own scope boundary); the learning agent inherits that
  limit and reports `needs-command` for anything else, it does not extend
  `mm build`.
- No change to `FAILURE_THRESHOLD` or the guard's self-demotion behaviour.

## Test plan

- Unit: `deriveCandidateId` is stable for the same steps/occurrences and
  differs when either changes.
- Unit: `mm-nudge.mjs`'s equality check — same candidate set on two
  consecutive runs writes the file once, not twice (mtime unchanged).
- Integration: `.mm/` absent → `mm-nudge.mjs` exits immediately, no file.
- Integration: `/mm:status` reports `review-pending` content when the file
  exists, and installed-hook telemetry from a fixture `.state.json` including
  a `disabledAt` case.
- `/mm:review` is a command (prompt-driven), not testable the way a CLI is —
  validate through `openspec validate learning-agent-pipeline --strict` and a
  manual run against a fixture `.mm/events/` with a known-flaky pattern
  (verify the agent's `false-positive` rejection) and a known-safe one
  (verify `recommend` with the correct build command).
