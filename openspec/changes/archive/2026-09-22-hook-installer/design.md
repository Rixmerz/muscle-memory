# Design: hook installer

## Package layout

`packages/mm-installer` (`@muscle-memory/installer`), shaped like
`packages/mm-builder`:

```
package.json           # bin: { "mm-install": "./dist/bin.js" }
tsconfig.build.json
tsconfig.json
src/
  settings.ts           # read/merge/write .claude/settings.json
  settings.test.ts
  guard.ts               # emits the fixed guard.mjs source, id derivation
  guard.test.ts
  bin.ts                 # `mm install` / `mm uninstall`
  bin.test.ts
  index.ts
```

Depends on `@muscle-memory/core` (workspace) for nothing beyond types; it
has no dependency on `@muscle-memory/builder` — it consumes a
`HookFragment`-shaped JSON, not the builder's code.

## Data shapes

```ts
interface HookFragment {           // produced by mm-builder, read here
  event: "PostToolUse";
  matcher: "Bash";
  command: string;
  sourceSignature: string;
}

interface InstallRecord {
  id: string;               // stable id, see "Deriving the id"
  sourceSignature: string;
  command: string;
  installedAt: string;      // ISO 8601
}

interface GuardState {
  id: string;
  consecutiveFailures: number;
  lastExitCode: number | null;
  disabledAt: string | null; // set once self-demoted
}
```

## Deriving the id

`id = sourceSignature + "-" + shortHash(command)` (8 hex chars, same hash
primitive `@muscle-memory/core` already uses for event args). Stable across
re-installs of the identical fragment — reinstalling is a no-op merge, not
a duplicate entry — and distinct across two different commands that happen
to share a mined signature.

## The guard

`.mm/hooks/guard.mjs` is emitted verbatim (not templated) by `mm install`
the first time any hook is installed in a repo, and is git-tracked like the
rest of `.mm/hooks/`. Its contract:

```
node .mm/hooks/guard.mjs <id> -- <real command...>
```

1. Runs `<real command...>` via `child_process.spawnSync` with the
   PostToolUse hook's stdin/env passed through untouched.
2. Reads `.mm/hooks/<id>.state.json` (absent = `consecutiveFailures: 0`).
3. Exit code `0` → reset `consecutiveFailures` to `0`, write state, exit 0.
4. Exit code non-zero → increment `consecutiveFailures`, write state.
   - `< 3` → exit with the real command's own exit code (surface the
     failure normally).
   - `>= 3` → call the same settings-merge routine `mm install` uses, in
     reverse, to strip its own `hooks.PostToolUse` entry from
     `.claude/settings.json`; write `disabledAt`; exit with the real
     command's exit code once, so the last failure still surfaces.

Self-demotion is a property of the guard, not of `mm install` polling
anything — there is no daemon and no scheduled check.

## Merging into .claude/settings.json

`readSettings(path)`: `JSON.parse` if the file exists, else `{}`. Never
touches keys other than `hooks.PostToolUse`.

`installEntry(settings, fragment, id)`:
- Ensure `settings.hooks.PostToolUse` is an array (create if absent).
- If an entry already carries `command` containing this exact `id`, return
  `settings` unchanged (idempotent re-install).
- Otherwise append:
  ```json
  {
    "matcher": "Bash",
    "hooks": [
      {
        "type": "command",
        "command": "node .mm/hooks/guard.mjs <id> -- <command>",
        "timeout": 5
      }
    ]
  }
  ```

`removeEntry(settings, id)`: filter `hooks.PostToolUse` to drop any entry
whose `hooks[].command` contains the id; drop the `PostToolUse` key
entirely if the array becomes empty; drop `hooks` entirely if it becomes
`{}`. Same function serves both `mm uninstall` and the guard's own
self-demotion path.

Writes go through a single `writeSettings(path, settings)` — `JSON.stringify(settings, null, 2) + "\n"` — so `mm install`, `mm uninstall`, and the guard
all produce byte-identical formatting.

## CLI

```
mm install <fragment-file> [--settings <path>]
mm uninstall <id> [--settings <path>]
```

`--settings` defaults to `.claude/settings.json` relative to `cwd`
(overridable for tests; never for real use — that default is load-bearing,
not a convenience).

`mm install`:
1. Parse and validate the fragment JSON (must match `HookFragment` shape;
   only `event: "PostToolUse"`, `matcher: "Bash"` are supported — anything
   else exits non-zero, same "not implemented" phrasing style as M4).
2. Derive `id`.
3. Write `.mm/hooks/guard.mjs` if absent (never overwrite an existing one —
   a repo may have installed hooks before a guard.mjs upgrade; upgrading it
   is a future concern, not this one).
4. Merge settings, write back.
5. Write `.mm/hooks/<id>.install.json`.
6. Print the id.

`mm uninstall <id>`:
1. Merge-remove from settings, write back.
2. Delete `.mm/hooks/<id>.install.json` and `.mm/hooks/<id>.state.json` if
   present.
3. Exit 0 whether or not the id was found (uninstalling twice is not an
   error — the end state is what matters).

## Out of scope

No `slash-command` / `mcp-tool` install (M4 does not produce those
fragments yet). No daemon, cron, or background process for demotion — it
happens inline, inside the guard, on the next matching tool call. No UI or
listing command (`mm list-installed`) — reading `.mm/hooks/*.install.json`
is sufficient for now. No re-installation upgrade path for an existing
`guard.mjs`.
