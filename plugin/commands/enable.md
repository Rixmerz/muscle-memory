---
description: Turn muscle-memory on for this repo — create .mm/, gitignore it, and say exactly what will be recorded
effort: low
---

Installing the plugin does not start recording. The hooks are registered, but
the logger exits immediately in any repo that has no `.mm/` directory. That
directory is the consent, and this command is how it gets created — per repo,
deliberately, with the user knowing what they agreed to.

**1. Say what gets recorded before creating anything.** One record per tool
call, appended to `.mm/events/<date>.ndjson`, containing: a UTC timestamp, the
session id, the working directory, the hook name, the tool name, a *normalised
signature*, and a one-way hash of the tool input. On `PostToolUse` it also
records whether the call succeeded and how long it took.

**2. Say what is never recorded, because this is the part people assume
wrongly.** The raw command never reaches disk. Neither does any file path, URL,
flag value, or the content of an Edit or Write. The signature is
`bash:pnpm-test`, not `pnpm test --reporter=json --token=…`. The argument hash
distinguishes inputs the signature collapses, and cannot be reversed to them.

**3. Create `.mm/` and add it to `.gitignore`** if it is not already there.
Event data is local and per-machine; a committed `.mm/` would mix several
people's behaviour into one pattern table and make every mined pattern
meaningless.

**4. Offer the backfill, do not run it unasked.** `/mm:backfill` replays this
repo's existing transcripts so the aggregator has history immediately instead
of in two weeks. Say that it reads `~/.claude/projects/<slug>/*.jsonl` and
writes the same records as above, partitioned by their original dates.

Finish with one line: recording is on for this repo only, and `/mm:disable`
(or deleting `.mm/`) stops it.
