## 1. Candidate id + nudge binary
- [ ] 1.1 `deriveCandidateId` (steps + occurrences → stable string), unit
      tested for stability and for differing on either input changing
- [ ] 1.2 `plugin/bin/mm-nudge.mjs` bundled binary per `design.md` §
      `mm-nudge.mjs`: `.mm/` consent gate, mine via `candidates()`, compare
      ids against `.mm/review-pending.json`, write only on change
- [ ] 1.3 Register it as a `SessionEnd` hook in `plugin/hooks/hooks.json`,
      alongside the existing logger entry — same `${CLAUDE_PLUGIN_ROOT}`
      pattern, own timeout

## 2. Learning agent
- [ ] 2.1 `plugin/agents/learning-agent.md`: frontmatter (`name`,
      `description`, `tools: Read, Grep, Glob, Bash`), body per `design.md`
      §§ 1-5 (determinism, safety, lifecycle placement, value, recommend)
- [ ] 2.2 Verdict output contract: last line is a JSON object
      `{ verdict, reason?, command? }`, `verdict` one of `recommend`,
      `reject`, `needs-command`

## 3. `/mm:review`
- [ ] 3.1 `plugin/commands/review.md` per `design.md` § `/mm:review` steps
      1-6 — mines via `mm run`, dispatches `learning-agent` per candidate,
      prints verdicts, installs nothing
- [ ] 3.2 Zero-candidates path states so explicitly and mentions
      `.mm/review-pending.json` if relevant

## 4. `/mm:status` additions
- [ ] 4.1 Review-pending section: read `.mm/review-pending.json` if present,
      report `count` and `minedAt`, point at `/mm:review`
- [ ] 4.2 Installed-hooks section: pair each `.mm/hooks/*.install.json` with
      its `*.state.json`, report `consecutiveFailures`, `lastExitCode`,
      `disabledAt` — explicit self-demotion note when `disabledAt` is set

## 5. Tests
- [ ] 5.1 Unit: `deriveCandidateId` stability/uniqueness
- [ ] 5.2 Unit: `mm-nudge.mjs` equality check skips the write on an unchanged
      candidate set
- [ ] 5.3 Integration: `.mm/` absent → `mm-nudge.mjs` no-ops
- [ ] 5.4 Integration: `/mm:status` fixture covering both new sections,
      including a `disabledAt` case
- [ ] 5.5 Manual: `/mm:review` against a fixture with one flaky (expect
      `reject`/`false-positive`) and one safe deterministic pattern (expect
      `recommend` with the correct build command)

## 6. Validate
- [ ] 6.1 `pnpm build && pnpm test && pnpm lint && pnpm typecheck` green
- [ ] 6.2 `pnpm bundle` regenerates `mm-nudge.mjs` identically (no diff)
- [ ] 6.3 `openspec validate learning-agent-pipeline --strict` passes

## 7. Docs
- [ ] 7.1 README "Status" section: add M7, describe `/mm:review` and the
      `SessionEnd` nudge, and state explicitly that install remains
      human-run — no change to the "Approval is the default" principle
- [ ] 7.2 CHANGELOG: new `0.8.0` entry for `/mm:review`, `learning-agent`,
      and the `/mm:status` telemetry additions
