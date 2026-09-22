# Design: hook builder

## Package

`packages/mm-builder` (`@muscle-memory/builder`), shaped like `mm-learner`:
workspace deps on `@muscle-memory/core`, `tsconfig.build.json`,
`bin: {"mm-build": "./dist/bin.js"}`.

```
packages/mm-builder/
  src/
    proposal-parser.ts   # parseProposal(markdown): { target, steps }
    hook.ts              # buildHook(steps, command): HookFragment
    bin.ts               # CLI: mm build <file> --command "<cmd>" [--write]
  package.json
  tsconfig.build.json
```

## Parsing a proposal

M3's `formatProposal` (`packages/mm-learner/src/proposal.ts:66-90`) renders a
fixed shape: a fenced ```` ``` ```` block under `## Steps` holding one
signature per line, and a `## Suggested target: \`<kind>\`` line. `parseProposal`
extracts both with two regexes matched against that exact shape — it does not
attempt a general markdown parse. If either is absent, it throws with the
file path, which `bin.ts` reports as "not a muscle-memory proposal".

```ts
interface ParsedProposal {
  target: "hook" | "slash-command";
  steps: string[]; // the mined signatures, e.g. ["bash:pnpm-test"]
}
```

## Validating the human's command

`buildHook(steps, command)`:

1. Refuses (throws) unless `steps.length === 1` — M3's `classify()`
   (`packages/mm-learner/src/proposal.ts:33-38`) only assigns `hook` when
   every step is the identical bash signature, so a well-formed `hook`
   proposal is always a single distinct signature repeated; `mm build` re-
   asserts that shape rather than trusting the label.
2. Computes `toolSignature("Bash", { command })` from
   `@muscle-memory/core` and compares it to `steps[0]`. Mismatch throws with
   both signatures shown — this is the check that stands in for the raw
   command the logger never recorded.
3. On match, returns:

```ts
interface HookFragment {
  event: "PostToolUse";
  matcher: string;      // "Bash"
  command: string;       // the human-supplied command, verbatim
  sourceSignature: string; // steps[0], for provenance
}
```

`PostToolUse` is the fixed event for every M4 hook: the mined pattern is
"after a bash call like this one, this always runs next" — a `PreToolUse`
hook would run *before* evidence that the triggering call happened, which is
not what was observed.

## CLI

`mm build <proposal-file> --command "<cmd>" [--write]`:

- No `--command` → exits 1, "‑‑command is required: mm build never invents
  the automation it installs."
- Target is `slash-command` → exits 1, "mm build only compiles `hook`
  proposals; slash-command build is not implemented."
- Validation failure → exits 1 with the mismatch detail from `buildHook`.
- Success, no `--write` → prints the `HookFragment` as JSON to stdout.
- Success, `--write` → also writes it to
  `.mm/hooks/<date>-<slug-of-command>.json`, creating the directory if
  needed. Unlike `.mm/events/`, `.mm/hooks/` is **not** gitignored — an
  installed fragment is meant to be reviewed and committed, per
  `README.md`'s "git-versioned artifacts" principle.

## Out of scope

No write to `.claude/settings.json`, no `slash-command`/`mcp-tool` target
support, no kill switch or demotion logic — those act on an *installed*
hook, and nothing here installs one.
