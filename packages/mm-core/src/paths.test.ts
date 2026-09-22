import { describe, expect, it } from "vitest";
import { eventFileFor, utcDay } from "./paths.js";

describe("utcDay / eventFileFor — UTC day boundary", () => {
  it("23:59:59.999 UTC stays on the earlier day's file", () => {
    const at = new Date("2024-03-14T23:59:59.999Z");
    expect(utcDay(at)).toBe("2024-03-14");
    expect(eventFileFor(at, "/repo")).toBe("/repo/.mm/events/2024-03-14.ndjson");
  });

  it("00:01:00.000 UTC rolls onto the next day's file", () => {
    const at = new Date("2024-03-15T00:01:00.000Z");
    expect(utcDay(at)).toBe("2024-03-15");
    expect(eventFileFor(at, "/repo")).toBe("/repo/.mm/events/2024-03-15.ndjson");
  });

  it("two minutes apart across midnight land in two different day files", () => {
    const before = new Date("2024-03-14T23:59:00.000Z");
    const after = new Date("2024-03-15T00:01:00.000Z");
    expect(eventFileFor(before, "/repo")).not.toBe(eventFileFor(after, "/repo"));
  });

  it("uses the UTC day regardless of the process's local timezone", () => {
    // toISOString (which utcDay is built on) is always UTC, independent of
    // TZ, so this is the same instant asserted the same way a machine in any
    // timezone would see it.
    const at = new Date("2024-03-14T23:59:59.999Z");
    const originalTz = process.env.TZ;
    process.env.TZ = "Pacific/Kiritimati"; // UTC+14, where local calendar date is already the 15th
    try {
      expect(utcDay(at)).toBe("2024-03-14");
    } finally {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }
  });
});
