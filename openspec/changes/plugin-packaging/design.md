## Context

Two facts set this design. First, Claude Code loads skills and subagents from a
plugin, not from a repository — so M3's deliverables have no home until this
lands. Second, a `git-subdir` install copies a directory and runs nothing: no
`pnpm install`, no build, no postinstall. Whatever the hook needs at runtime
has to already be in the tree.

## Decisions

**The plugin is a `plugin/` subdirectory, not the repository root.** This is
the convention the sibling plugins in this namespace already use
(flowtrace, livespec, rastro), and it keeps the monorepo's build tooling,
workspaces, tests and openspec tree out of what gets copied into a user's
plugin cache.

*Alternative rejected:* root-level `.claude-plugin/plugin.json` with a `github`
source. Simpler to declare, but it ships the entire monorepo — including
`node_modules` resolution that will not exist on the other side — into every
install.

**The binary is a committed bundle.** `plugin/bin/mm-log.mjs` is a single ESM
file with no external imports, produced by esbuild from
`packages/mm-logger/src/bin.ts`. Committing build output is normally a smell;
here it is the delivery mechanism, and the spec makes it auditable by requiring
the bundle to be byte-reproducible so a hand-edit or a stale rebuild shows up
as a diff.

The bundle also happens to help the 30 ms budget: one file, no `node_modules`
directory walk, no workspace symlink resolution.

*Alternative rejected:* publish `@muscle-memory/logger` to npm and have the
hook call `npx`. That puts a registry lookup on the critical path of every tool
call. Not viable at any latency budget.

**`.mm/` is the consent artifact, and the check runs first.** The logger's
first statement is a `stat` of `.mm/` in the working directory; absent, it
exits 0 having read nothing. This is what makes it safe for the plugin to
register `PreToolUse` on `*`: installation is inert, and recording starts only
where someone ran `/mm:enable`.

Using directory presence rather than a config key is deliberate. The thing
being consented to *is* the directory the data lands in, so consent and storage
cannot drift apart, and revoking is `rm -rf .mm` — no stale flag pointing at
data that still exists.

*Alternative rejected:* an env var like `MM_ENABLED=1`. Global rather than
per-repo, invisible in the repository it affects, and it cannot be revoked by
deleting the data.

**Generated hooks never live in the plugin.** The plugin cache is version-pinned
and replaced wholesale on upgrade; a hook muscle-memory compiled for *this*
repository would vanish on the next `claude plugin update`, or worse, persist
into an unrelated one. Compiled hooks go to the project's own
`.claude/settings.json` behind the approval gate M4 specifies. The plugin ships
the *observer*; the *output* stays with the project it was learned from.

## Risks

- **Registering `PreToolUse` on `*` is a large blast radius even when inert.**
  The mitigation is the opt-in and the fact that the opt-out path does no
  parsing — but it means the `.mm/` check is now a latency-critical, privacy-
  critical, four-line function. It gets its own tests, and the benchmark runs
  against both paths.
- **A committed bundle can drift from source.** Reproducibility is specified,
  not hoped for; CI should run the bundle script and fail on a dirty tree.
- **`plugin/agents/` and `plugin/skills/` are empty until M3.** An empty
  plugin directory is honest; a placeholder skill would not be.
