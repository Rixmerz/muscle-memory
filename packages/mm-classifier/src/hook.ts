/**
 * A decision, re-expressed as Claude Code hook output. Only four outcomes
 * mean anything to a hook; every other outcome is a decision for some other
 * consumer and prints nothing here.
 */
import type { Decision } from "./decide.js";

function reasonOf(decision: Decision): string {
  return `classifier ${decision.classifier}: ${decision.label} (${decision.confidence.toFixed(2)})`;
}

/** The JSON to print for `event`, or `null` to print nothing. */
export function hookOutput(event: string, decision: Decision): Record<string, unknown> | null {
  const outcome = decision.outcome === "block" ? "deny" : decision.outcome;
  if (event === "PreToolUse") {
    if (outcome !== "allow" && outcome !== "ask" && outcome !== "deny") return null;
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: outcome,
        permissionDecisionReason: reasonOf(decision),
      },
    };
  }
  if (outcome === "deny") return { decision: "block", reason: reasonOf(decision) };
  return null;
}

/** The `settings.json` fragment that runs `hook` on one classifier. */
export function hookFragment(
  event: string,
  matcher: string,
  binPath: string,
  classifierRef: string,
): Record<string, unknown> {
  return {
    hooks: {
      [event]: [
        {
          matcher,
          hooks: [
            { type: "command", command: `node "${binPath}" hook "${classifierRef}"`, timeout: 10 },
          ],
        },
      ],
    },
  };
}
