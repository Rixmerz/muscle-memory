/**
 * Validates a human-supplied command against a proposal's mined signature
 * and renders the `PostToolUse` hook fragment (design.md § Validating the
 * human's command). The event log never stored the raw command, so this
 * check — not the mined data itself — is what stands in for it.
 */
import { toolSignature } from "@muscle-memory/core";

export interface HookFragment {
  event: "PostToolUse";
  matcher: "Bash";
  command: string;
  sourceSignature: string;
}

export function buildHook(steps: string[], command: string): HookFragment {
  if (steps.length !== 1) {
    throw new Error(
      `mm build only compiles a single-step hook proposal, got ${steps.length} steps: ${steps.join(", ")}`,
    );
  }

  const sourceSignature = steps[0] as string;
  const computedSignature = toolSignature("Bash", { command });

  if (computedSignature !== sourceSignature) {
    throw new Error(
      `command does not match the proposal's mined signature: expected \`${sourceSignature}\`, got \`${computedSignature}\``,
    );
  }

  return {
    event: "PostToolUse",
    matcher: "Bash",
    command,
    sourceSignature,
  };
}
