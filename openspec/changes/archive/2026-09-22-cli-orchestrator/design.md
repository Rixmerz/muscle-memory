# Design: cli-orchestrator

## Package layout

```
packages/mm-cli/
  package.json        # workspace deps on aggregator, learner, builder, installer, core
  tsconfig.build.json
  src/
    bin.ts            # subcommand dispatch, all flag parsing
    index.ts           # empty export {} stub, matches other packages' barrel shape
```

`bin: {"mm": "./dist/bin.js"}` in `package.json`.

## Dependencies

`mm-cli` imports, in-process (no `child_process`, no shelling out to other
packages' CLIs):

- `@muscle-memory/aggregator`: `candidates(cwd, {minScore})` — same deep-import
  path `mm-learner` already uses (`dist/candidates.js`), since the package
  barrel is empty (`export {}`).
- `@muscle-memory/learner`: `formatProposal(candidate)`.
- `@muscle-memory/builder`: `parseProposal` is not needed — `mm-cli` builds
  directly from an in-memory candidate, not from a written proposal file, so
  it calls `buildHook(steps, command)` directly against the candidate's steps.
- `@muscle-memory/installer`: `deriveId`, `GUARD_SOURCE`, `installEntry`,
  `readSettings`, `writeSettings` — the same install sequence as
  `mm-install install`, inlined instead of shelled out.

## `src/bin.ts` dispatch

Single command, no subcommand keyword — `mm run [flags]`:

```
parseArgs(argv): { minScore: number; build: number | undefined; command: string | undefined; install: boolean }
```

Flow:

1. Parse flags. `--install` without `--build` → `fail("--install requires --build")`.
2. `candidates(cwd, {minScore})` → same call `mm candidates` makes.
3. No `--build`: print each candidate via `formatProposal`, prefixed `[i]`, exit 0.
4. `--build <n>`: bounds-check `n` against the candidates array; out of range →
   `fail(...)` naming the index and count.
5. Selected candidate has `target === "slash-command"` → `fail("mm build only compiles \`hook\` proposals; slash-command build is not implemented.")` (verbatim, matching `mm-builder/src/bin.ts:76`).
6. No `--command` → `fail("--command is required: mm build never invents the automation it installs.")` (verbatim, matching `mm-builder/src/bin.ts:80`).
7. `buildHook(candidate.steps, command)` → fragment. Print JSON. If not
   `--install`, exit 0.
8. `--install`: `deriveId(fragment)`, ensure `.mm/hooks/guard.mjs` exists
   (write `GUARD_SOURCE` if absent), `readSettings` → `installEntry` →
   `writeSettings`, write `<id>.install.json` record — same sequence as
   `mm-installer/src/bin.ts:88-111`. Print `id`, exit 0.

## Out of scope

- No subcommands beyond the single `run` behavior (no `mm run candidates`,
  no `mm run install <id>` uninstall path — `mm-install uninstall` stays a
  separate entrypoint).
- No new proposal file format — `mm-cli` never writes to `.mm/proposals/`;
  that write path stays exclusive to `mm propose --write`.

## Test plan

- Unit: flag parsing (bounds, missing `--command`, `--install` without
  `--build`).
- Integration: no-flag run against a fixture `.mm/events/` prints proposals,
  writes nothing under `.mm/` or `.claude/`.
- Integration: `--build --command` prints a fragment, `.claude/settings.json`
  untouched.
- Integration: `--build --command --install` ends with an entry in
  `.claude/settings.json` and a `.mm/hooks/<id>.install.json` record.
- Integration: slash-command-target candidate at selected index fails with
  the exact rejection message.
