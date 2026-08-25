import { describe, expect, it } from "vitest";
import { pendingReminderMilestone } from "../../src/domain/reminders.js";

describe("reminder milestones", () => {
  const lastStudiedAt = "2026-08-01T12:00:00.000Z";

  it("reaches the configured milestones at their exact boundaries", () => {
    expect(pendingReminderMilestone(
      lastStudiedAt,
      null,
      new Date("2026-08-02T11:59:59.999Z"),
    )).toBeNull();
    expect(pendingReminderMilestone(
      lastStudiedAt,
      null,
      new Date("2026-08-02T12:00:00.000Z"),
    )).toBe(1);
    expect(pendingReminderMilestone(
      lastStudiedAt,
      1,
      new Date("2026-08-05T12:00:00.000Z"),
    )).toBe(4);
    expect(pendingReminderMilestone(
      lastStudiedAt,
      30,
      new Date("2027-08-01T12:00:00.000Z"),
    )).toBeNull();
  });

  it("returns only the latest milestone after a delayed run", () => {
    expect(pendingReminderMilestone(
      lastStudiedAt,
      null,
      new Date("2026-08-09T12:00:00.000Z"),
    )).toBe(7);
  });
});
