import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { UserProfileRepository } from "../../src/repositories/user-profile.repo.js";
import { createCheckCalendarTool } from "../../src/tools/calendar-check.js";

// Spec: specs/meal-planning/weekly-plan.md — check_calendar tool

describe("check_calendar tool", () => {
  let profileRepo: UserProfileRepository;
  let tool: ReturnType<typeof createCheckCalendarTool>;

  beforeEach(() => {
    const { db } = createTestDb();
    profileRepo = new UserProfileRepository(db);
    tool = createCheckCalendarTool(profileRepo);
  });

  it("has correct name", () => {
    expect(tool.name).toBe("check_calendar");
  });

  it("returns default cooking window when no preferences set", async () => {
    const respond = vi.fn();
    await tool.handler({ weekStart: "2026-04-27" }, { respond });

    expect(respond).toHaveBeenCalledWith(true, expect.objectContaining({ ok: true }));
    const result = respond.mock.calls[0][1];
    expect(result.calendarConnected).toBe(false);
    expect(result.cookingWindowStart).toBe("17:00");
    expect(result.dinnerTargetTime).toBe("19:30");
    expect(result.defaultAvailableMinutes).toBe(150); // 5pm to 7:30pm
    expect(result.action).toBe("ask_user");
  });

  it("uses custom cooking window from preferences", async () => {
    await profileRepo.setPreference("cooking_window_start", "18:00");
    await profileRepo.setPreference("dinner_target_time", "20:00");

    const respond = vi.fn();
    await tool.handler({ weekStart: "2026-04-27" }, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.cookingWindowStart).toBe("18:00");
    expect(result.dinnerTargetTime).toBe("20:00");
    expect(result.defaultAvailableMinutes).toBe(120); // 6pm to 8pm
  });

  it("includes week range in instructions", async () => {
    const respond = vi.fn();
    await tool.handler({ weekStart: "2026-04-27", weekEnd: "2026-05-03" }, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.instructions).toContain("2026-04-27");
    expect(result.instructions).toContain("2026-05-03");
  });

  it("falls back to 'Sunday' when weekEnd not provided", async () => {
    const respond = vi.fn();
    await tool.handler({ weekStart: "2026-04-27" }, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.instructions).toContain("Sunday");
  });

  it("instructs agent to ask user directly", async () => {
    const respond = vi.fn();
    await tool.handler({ weekStart: "2026-04-27" }, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.action).toBe("ask_user");
    expect(result.instructions).toContain("not connected");
    expect(result.instructions).toContain("which nights");
  });

  it("calculates minutes correctly for various windows", async () => {
    // Early start, late dinner
    await profileRepo.setPreference("cooking_window_start", "16:00");
    await profileRepo.setPreference("dinner_target_time", "20:30");

    const respond = vi.fn();
    await tool.handler({ weekStart: "2026-04-27" }, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.defaultAvailableMinutes).toBe(270); // 4pm to 8:30pm = 4.5 hours
  });
});
