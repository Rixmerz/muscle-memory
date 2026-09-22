import { describe, expect, it } from "vitest";
import { buildHook } from "./hook.js";

describe("buildHook", () => {
  // Scenario: command matches the mined signature
  it("returns a PostToolUse fragment when the command's signature matches the single step", () => {
    const fragment = buildHook(["bash:pnpm-test"], "pnpm test");
    expect(fragment).toEqual({
      event: "PostToolUse",
      matcher: "Bash",
      command: "pnpm test",
      sourceSignature: "bash:pnpm-test",
    });
  });

  // Scenario: command does not match the mined signature
  it("throws showing both signatures when the command does not match", () => {
    expect(() => buildHook(["bash:pnpm-test"], "rm -rf node_modules")).toThrow(
      /bash:pnpm-test.*bash:rm/s,
    );
  });

  // multi-step input rejected
  it("throws when given more than one step", () => {
    expect(() => buildHook(["bash:pnpm-test", "bash:pnpm-test"], "pnpm test")).toThrow(
      /single-step/,
    );
  });

  it("throws when given zero steps", () => {
    expect(() => buildHook([], "pnpm test")).toThrow(/single-step/);
  });
});
