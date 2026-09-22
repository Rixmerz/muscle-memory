# Design: learning proposer

## Package

`packages/mm-learner` (`@muscle-memory/learner`), shaped like `mm-aggregator`:
workspace dep on `@muscle-memory/aggregator`, `tsconfig.build.json`,
`bin: {"mm-propose": "./dist/bin.js"}`.

```
packages/mm-learner/
  src/
    proposal.ts   # formatProposal(candidate: ScoredPattern): Proposal
    bin.ts        # CLI: mm propose [--min-score 0.8] [--write]
  package.json
  tsconfig.build.json
```

## Data shapes

```ts
type TargetKind = "hook" | "slash-command";

interface Proposal {
  target: TargetKind;
  markdown: string;
}
```

## Classification heuristic

`target = "hook"` iff every step in `candidate.steps` is the identical
`bash:*` signature. Any other step composition (different bash signatures,
non-bash tools, mixed) classifies `"slash-command"`. This is the only
heuristic — no ML, no config file, matches the M3 scope of "propose", not
"decide well".

## Rendering

`formatProposal` writes a fixed markdown template: step sequence as a code
block, a table of the six `ScoredPattern` factor values (read directly off
the object `@muscle-memory/aggregator` already returns — no re-scoring), the
classified target, and one templated rationale sentence keyed by target kind.

## CLI

`mm propose` calls `@muscle-memory/aggregator`'s `candidates(root, {minScore})`
directly — same function M2's `mm candidates` calls — then maps each result
through `formatProposal` and prints. `--write` additionally writes each
proposal to `.mm/proposals/<YYYY-MM-DD>-<slug>.md`, slug derived from the
pattern's steps (joined, kebab-cased, truncated). `.mm/proposals/` needs no
new gitignore entry — `.mm/` is already ignored in full.

## Out of scope

No hook compilation, no `plugin/` writes, no `.claude/settings.json` writes,
no candidate ranking beyond what M2 already provides. M4 builds from a
proposal; M3 only writes the proposal.
