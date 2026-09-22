---
description: What muscle-memory has recorded in this repo, and what it has not
effort: low
---

Report the state of the local event log. No mining, no candidates — those
belong to `/mm:candidates` once the aggregator exists.

**1. Is recording on here?** `.mm/` present or absent. Absent means every hook
invocation has been exiting immediately and nothing was recorded — say so
plainly rather than reporting an empty log as if it were a quiet week.

**2. What is in the log.** Count the day files under `.mm/events/`, the total
record count, the first and last timestamp, and how many distinct sessions are
represented. The session count is the one that matters: the pattern gates
require a behaviour to appear in at least three sessions across at least two
days, so a log with a thousand records from one session supports nothing.

**3. The top signatures by frequency**, ten at most, with their counts. This is
the raw material, not a result — say that the aggregator has not judged any of
it yet.

**4. Size on disk**, and whether `.mm/` is gitignored. If it is not, say so as
a problem, not a note: committed event data mixes several machines' behaviour
into one table.

**5. Review pending.** If `.mm/review-pending.json` exists, report its
`count` and `minedAt`, and say `/mm:review` is how to see them judged.

**6. Installed hooks.** For each `.mm/hooks/<id>.install.json`, pair it with
the matching `<id>.state.json` if present and report `consecutiveFailures`,
`lastExitCode`, and `disabledAt`. A non-null `disabledAt` means muscle-memory
turned that hook off by itself after 3 consecutive failures — say this
plainly, not just the raw field.

Finish with one line on what would have to be true before anything is minable
from what is there.
