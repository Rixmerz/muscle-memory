# Design: pattern aggregator

## Package

`packages/mm-aggregator` (`@muscle-memory/aggregator`), shaped like
`mm-logger`: workspace dep on `@muscle-memory/core`, `tsconfig.build.json`,
`bin: {"mm-candidates": "./dist/bin.js"}`.

```
packages/mm-aggregator/
  src/
    ndjson.ts       # readEvents(root): reads every .mm/events/*.ndjson day file
    sequences.ts     # groupSessions(events), mineNgrams(sessions, {minLen,maxLen})
    score.ts          # score(pattern, corpus): the six factors + penalty
    candidates.ts    # candidates(root, {minScore}): pipeline + filter + sort
    bin.ts             # CLI: mm candidates [--min-score 0.8] [--json]
  package.json
  tsconfig.build.json
```

## Data shapes

```ts
interface Pattern {
  steps: string[];              // the sig sequence, length 2-4
  occurrences: Occurrence[];
}

interface Occurrence {
  session: string;
  startTs: string;               // ts of the first step
  argHash: string;                // arg of the first step
  stepsOk: boolean[];             // per-step PostToolUse.ok, true if unmatched
}

interface ScoredPattern extends Pattern {
  score: number;
  sessions: number;               // distinct session count
}
```

## Matching a step's outcome

`PostToolUse` records are matched to the preceding `PreToolUse` by
`(session, sig)` adjacency in the ordered event stream — the next
`PostToolUse` in the same session after a `PreToolUse` with the same `sig`.
No `tool_use_id` exists in `MMEvent`, so this is a positional match, not an
id join; it is exactly the ordering the mining step already relies on.

## Determinism cap

`arg` is a 12-hex truncated hash (`packages/mm-core/src/signature.ts`), not
the raw input — `determinismo` measures repetition of that hash, not of the
underlying arguments. This is a proxy, and the spec says so implicitly by
scoping the requirement to "arg hash", not "arguments".

## Out of scope

No hook compiling, no `.mm/candidates.json` persistence, no interaction with
`plugin/`. `mm candidates` is read-only and prints; M3's learning subagent
decides what happens to a candidate.
