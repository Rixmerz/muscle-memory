import { describe, expect, it } from "vitest";
import { parseProposal } from "./proposal-parser.js";

const HOOK_PROPOSAL = `# Pattern: bash:pnpm-test

## Steps

\`\`\`
bash:pnpm-test
\`\`\`

## Score: 0.85

| Factor | Value |
|---|---|
| frecuencia | 1.00 |

## Suggested target: \`hook\`

Every occurrence runs the identical bash command, so this pattern can fire unattended as a hook.
`;

const SLASH_COMMAND_PROPOSAL = `# Pattern: bash:pnpm-test -> edit:java

## Steps

\`\`\`
bash:pnpm-test
edit:java
\`\`\`

## Score: 0.85

| Factor | Value |
|---|---|
| frecuencia | 1.00 |

## Suggested target: \`slash-command\`

This pattern mixes tools or commands, so it needs a human to trigger it as a slash command rather than firing automatically.
`;

describe("parseProposal", () => {
  // Scenario: valid hook proposal
  it("reads the target and steps from a valid hook proposal", () => {
    const parsed = parseProposal(HOOK_PROPOSAL);
    expect(parsed.target).toBe("hook");
    expect(parsed.steps).toEqual(["bash:pnpm-test"]);
  });

  it("reads a multi-step slash-command proposal", () => {
    const parsed = parseProposal(SLASH_COMMAND_PROPOSAL);
    expect(parsed.target).toBe("slash-command");
    expect(parsed.steps).toEqual(["bash:pnpm-test", "edit:java"]);
  });

  // Scenario: file is not a proposal
  it("throws naming the missing Steps block", () => {
    const markdown = "# Just some markdown\n\nNo steps or target here.\n";
    expect(() => parseProposal(markdown)).toThrow(/Steps/);
  });

  it("throws naming the missing Suggested target line when Steps is present but the target isn't", () => {
    const markdown = "## Steps\n\n```\nbash:pnpm-test\n```\n";
    expect(() => parseProposal(markdown)).toThrow(/Suggested target/);
  });
});
