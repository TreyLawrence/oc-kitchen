import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { UserProfileRepository } from "../../src/repositories/user-profile.repo.js";
import { createCheckCalendarTool } from "../../src/tools/calendar-check.js";
import { CalendarService } from "../../src/services/calendar.service.js";

// Spec: specs/meal-planning/weekly-plan.md — check_calendar tool

describe("check_calendar tool", () => {
  let profileRepo: UserProfileRepository;
  let calendarService: CalendarService;

  beforeEach(() => {
    const { db } = createTestDb();
    profileRepo = new UserProfileRepository(db);
    calendarService = new CalendarService();
  });

  describe("when calendar is not connected", () => {
    let tool: ReturnType<typeof createCheckCalendarTool>;

    beforeEach(() => {
      tool = createCheckCalendarTool(profileRepo, calendarService);
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
      await profileRepo.setPreference("cooking_window_start", "16:00");
      await profileRepo.setPreference("dinner_target_time", "20:30");

      const respond = vi.fn();
      await tool.handler({ weekStart: "2026-04-27" }, { respond });

      const result = respond.mock.calls[0][1];
      expect(result.defaultAvailableMinutes).toBe(270); // 4pm to 8:30pm = 4.5 hours
    });
  });

  describe("when calendar is connected", () => {
    let tool: ReturnType<typeof createCheckCalendarTool>;

    beforeEach(async () => {
      await profileRepo.setPreference("google_calendar_token", "fake-token");
      vi.spyOn(calendarService, "listEvents").mockResolvedValue([]);
      tool = createCheckCalendarTool(profileRepo, calendarService);
    });

    it("returns calendarConnected true", async () => {
      const respond = vi.fn();
      await tool.handler({ weekStart: "2026-04-27", weekEnd: "2026-05-03" }, { respond });

      expect(respond).toHaveBeenCalledWith(true, expect.objectContaining({ ok: true }));
      const result = respond.mock.calls[0][1];
      expect(result.calendarConnected).toBe(true);
      expect(result.days).toBeDefined();
    });

    it("returns 7 days for a full week", async () => {
      const respond = vi.fn();
      await tool.handler({ weekStart: "2026-04-27", weekEnd: "2026-05-03" }, { respond });

      const result = respond.mock.calls[0][1];
      expect(result.days).toHaveLength(7);
      expect(result.days[0].date).toBe("2026-04-27");
      expect(result.days[0].dayOfWeek).toBe(0); // Monday
      expect(result.days[6].date).toBe("2026-05-03");
      expect(result.days[6].dayOfWeek).toBe(6); // Sunday
    });

    it("shows full availability when no events conflict", async () => {
      const respond = vi.fn();
      await tool.handler({ weekStart: "2026-04-27", weekEnd: "2026-05-03" }, { respond });

      const result = respond.mock.calls[0][1];
      const monday = result.days[0];
      expect(monday.availableMinutes).toBe(150);
      expect(monday.canStartAt).toBe("17:00");
      expect(monday.mustBeReadyBy).toBe("19:30");
    });

    it("marks weekends with extended window", async () => {
      const respond = vi.fn();
      await tool.handler({ weekStart: "2026-04-27", weekEnd: "2026-05-03" }, { respond });

      const result = respond.mock.calls[0][1];
      const saturday = result.days[5];
      expect(saturday.isWeekend).toBe(true);
      expect(saturday.availableMinutes).toBe(480);
    });

    it("reduces available time when events overlap cooking window", async () => {
      vi.spyOn(calendarService, "listEvents").mockResolvedValue([
        {
          id: "ev1",
          summary: "Team standup",
          start: { dateTime: "2026-04-28T17:00:00" },
          end: { dateTime: "2026-04-28T18:00:00" },
        },
      ]);

      const respond = vi.fn();
      await tool.handler({ weekStart: "2026-04-27", weekEnd: "2026-05-03" }, { respond });

      const result = respond.mock.calls[0][1];
      const tuesday = result.days[1];
      expect(tuesday.availableMinutes).toBe(90); // 6pm-7:30pm
      expect(tuesday.canStartAt).toBe("18:00");
      expect(tuesday.events).toHaveLength(1);
      expect(tuesday.events[0].title).toBe("Team standup");
    });

    it("reports error from Google Calendar API", async () => {
      vi.spyOn(calendarService, "listEvents").mockRejectedValue(
        new Error("Google Calendar API error (401): Unauthorized")
      );

      const respond = vi.fn();
      await tool.handler({ weekStart: "2026-04-27", weekEnd: "2026-05-03" }, { respond });

      expect(respond).toHaveBeenCalledWith(false, expect.objectContaining({
        ok: false,
        error: expect.stringContaining("401"),
      }));
    });

    it("uses param overrides for cooking window", async () => {
      const respond = vi.fn();
      await tool.handler({
        weekStart: "2026-04-27",
        weekEnd: "2026-05-03",
        cookingWindowStart: "16:00",
        dinnerTargetTime: "20:00",
      }, { respond });

      const result = respond.mock.calls[0][1];
      const monday = result.days[0];
      expect(monday.availableMinutes).toBe(240); // 4pm-8pm
      expect(monday.canStartAt).toBe("16:00");
      expect(monday.mustBeReadyBy).toBe("20:00");
    });
  });
});
