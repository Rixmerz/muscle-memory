import { describe, expect, it } from "vitest";
import { deriveId, nextGuardState } from "./guard.js";

describe("deriveId", () => {
  it("is stable across re-installs of the identical fragment", () => {
    const fragment = { sourceSignature: "bash:pnpm-test", command: "pnpm test" };
    expect(deriveId(fragment)).toBe(deriveId(fragment));
  });

  it("distinguishes two commands sharing a mined signature", () => {
    const a = deriveId({ sourceSignature: "bash:pnpm-test", command: "pnpm test" });
    const b = deriveId({ sourceSignature: "bash:pnpm-test", command: "pnpm test --watch" });

    expect(a).not.toBe(b);
  });

  it("is `sourceSignature-shortHash(command)`", () => {
    const id = deriveId({ sourceSignature: "bash:pnpm-test", command: "pnpm test" });
    expect(id).toMatch(/^bash:pnpm-test-[0-9a-f]{8}$/);
  });
});

describe("nextGuardState", () => {
  it("resets the streak to 0 on a successful run", () => {
    const previous = { id: "x", consecutiveFailures: 1, lastExitCode: 1, disabledAt: null };
    const { state, shouldDemote } = nextGuardState("x", previous, 0);

    expect(state.consecutiveFailures).toBe(0);
    expect(state.lastExitCode).toBe(0);
    expect(shouldDemote).toBe(false);
  });

  it("increments the streak on a failure under the threshold", () => {
    const previous = { id: "x", consecutiveFailures: 1, lastExitCode: 1, disabledAt: null };
    const { state, shouldDemote } = nextGuardState("x", previous, 1);

    expect(state.consecutiveFailures).toBe(2);
    expect(shouldDemote).toBe(false);
    expect(state.disabledAt).toBeNull();
  });

  it("flags demotion and stamps disabledAt at the 3rd consecutive failure", () => {
    const previous = { id: "x", consecutiveFailures: 2, lastExitCode: 1, disabledAt: null };
    const { state, shouldDemote } = nextGuardState("x", previous, 1);

    expect(state.consecutiveFailures).toBe(3);
    expect(shouldDemote).toBe(true);
    expect(state.disabledAt).not.toBeNull();
  });

  it("treats an absent previous state as consecutiveFailures: 0", () => {
    const { state, shouldDemote } = nextGuardState("x", undefined, 1);

    expect(state.consecutiveFailures).toBe(1);
    expect(shouldDemote).toBe(false);
  });
});
