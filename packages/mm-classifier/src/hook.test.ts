import { describe, expect, it } from "vitest";
import type { Decision } from "./decide.js";
import { hookFragment, hookOutput } from "./hook.js";

function decision(outcome: string): Decision {
  return { classifier: "bash-risk", outcome, reason: "routed", label: "destructive", confidence: 0.884, answers: {}, model: null };
}

describe("hookOutput", () => {
  it.each(["allow", "ask", "deny"])("maps %s to a PreToolUse permission decision", (outcome) => {
    expect(hookOutput("PreToolUse", decision(outcome))).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: outcome,
        permissionDecisionReason: "classifier bash-risk: destructive (0.88)",
      },
    });
  });

  it("treats block as deny on PreToolUse", () => {
    expect((hookOutput("PreToolUse", decision("block")) as any).hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("maps deny and block to decision:block on other events", () => {
    expect(hookOutput("UserPromptSubmit", decision("deny"))).toEqual({
      decision: "block",
      reason: "classifier bash-risk: destructive (0.88)",
    });
    expect(hookOutput("PostToolUse", decision("block"))).toMatchObject({ decision: "block" });
  });

  it("prints nothing for any other outcome", () => {
    expect(hookOutput("PreToolUse", decision("continue"))).toBeNull();
    expect(hookOutput("UserPromptSubmit", decision("ask"))).toBeNull();
  });
});

describe("hookFragment", () => {
  it("wires the bin's hook subcommand with a 10s timeout", () => {
    expect(hookFragment("PreToolUse", "Bash", "/p/mm-classifier.mjs", "$CLAUDE_PROJECT_DIR/x.json")).toEqual({
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [{ type: "command", command: 'node "/p/mm-classifier.mjs" hook "$CLAUDE_PROJECT_DIR/x.json"', timeout: 10 }],
          },
        ],
      },
    });
  });
});
