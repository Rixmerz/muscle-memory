---
description: Judge mined candidates through a read-only learning agent — prints verdicts and build commands, installs nothing
effort: low
---

**1. Say what this does before running anything.** Mines the same candidates
`mm run` would print, asks a read-only subagent to judge each one, and prints
its verdicts — installs nothing.

**2. Run `mm run` (no `--build`)** to get the ranked candidates.

**3. No candidates:** say so plainly. If `.mm/review-pending.json` was what
triggered this, mention it. Stop here.

**4. For each candidate**, dispatch the `learning-agent` subagent with: the
candidate's steps, occurrences, score, and up to 3 example records from
`.mm/events/` for that signature (read the same file `mm candidates` reads).

**5. Print each verdict.** For `recommend`, print the exact `mm run --build
<n> --command "<cmd>" --install` invocation and nothing else — never run it.
For `reject`, print the reason. For `needs-command`, name the unsupported
trigger.

**6. `.mm/review-pending.json` is not cleared by this command.** It reflects
"unreviewed since last mine" and stays until the underlying candidate set
changes (the nudge's own equality check), not until `/mm:review` runs. If the
file still exists afterward, say this explicitly so the user does not read
its persistence as review having failed.
