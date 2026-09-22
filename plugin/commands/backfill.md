---
description: Replay this repo's existing Claude Code transcripts into the event log
effort: low
---

The aggregator needs history. Without backfill it gets it by waiting two weeks;
with it, the transcripts already on disk become events immediately.

**1. Say what it will read and write before running it.** It reads
`~/.claude/projects/<slug>/*.jsonl` for this repo only, and writes records to
`.mm/events/`, partitioned by each event's *original* date — not today's. The
records carry the same normalised signature and one-way argument hash as live
recording; no raw command, path, or payload is written.

**2. Refuse if `.mm/` does not exist** and point at `/mm:enable`. Backfill is
not a way around the per-repo opt-in.

**3. Run it, then report the delta**: records added, date range covered,
distinct sessions found. A re-run over unchanged transcripts must add nothing —
it rewrites each day file and renames it into place rather than appending. If
the count changed on a second run over the same input, that is a bug; say so.

Finish with one line on whether the log now clears the minimum the pattern
gates need: three sessions spanning at least two days.
