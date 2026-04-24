import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { UserProfileRepository } from "../../src/repositories/user-profile.repo.js";
import { MealPlanRepository } from "../../src/repositories/meal-plan.repo.js";
import { RecipeRepository } from "../../src/repositories/recipe.repo.js";
import { createSyncCookingCalendarTool } from "../../src/tools/calendar-sync.js";
import { CalendarService } from "../../src/services/calendar.service.js";

// Spec: specs/meal-planning/weekly-plan.md — rule 11, sync_cooking_calendar tool

describe("sync_cooking_calendar tool", () => {
  let profileRepo: UserProfileRepository;
  let mealPlanRepo: MealPlanRepository;
  let recipeRepo: RecipeRepository;
  let calendarService: CalendarService;
  let tool: ReturnType<typeof createSyncCookingCalendarTool>;

  beforeEach(() => {
    const { db } = createTestDb();
    profileRepo = new UserProfileRepository(db);
    mealPlanRepo = new MealPlanRepository(db);
    recipeRepo = new RecipeRepository(db);
    calendarService = new CalendarService();
    tool = createSyncCookingCalendarTool(
      profileRepo,
      mealPlanRepo,
      recipeRepo,
      calendarService
    );
  });

  it("has correct name", () => {
    expect(tool.name).toBe("sync_cooking_calendar");
  });

  it("returns error for nonexistent meal plan", async () => {
    const respond = vi.fn();
    await tool.handler({ mealPlanId: "nonexistent" }, { respond });

    expect(respond).toHaveBeenCalledWith(
      false,
      expect.objectContaining({ ok: false, error: "Meal plan not found" })
    );
  });

  describe("without calendar connected", () => {
    it("returns updated schedule for agent to relay", async () => {
      const recipe = await recipeRepo.create({
        title: "Gochujang Chicken",
        source: "manual",
        instructions: "Cook it",
        prepMinutes: 20,
        cookMinutes: 40,
      });

      const plan = await mealPlanRepo.create({
        name: "Week of Apr 27",
        weekStart: "2026-04-27",
        weekEnd: "2026-05-03",
        entries: [
          {
            dayOfWeek: 0,
            mealType: "dinner",
            recipeId: recipe.id,
            category: "exploit",
          },
        ],
      });

      const respond = vi.fn();
      await tool.handler({ mealPlanId: plan.id }, { respond });

      expect(respond).toHaveBeenCalledWith(
        true,
        expect.objectContaining({ ok: true })
      );
      const result = respond.mock.calls[0][1];
      expect(result.calendarConnected).toBe(false);
      expect(result.schedule).toHaveLength(1);
      expect(result.schedule[0].title).toContain("Gochujang Chicken");
    });
  });

  describe("with calendar connected", () => {
    beforeEach(async () => {
      await profileRepo.setPreference(
        "google_calendar_token",
        "fake-token"
      );
      vi.spyOn(calendarService, "createEvent").mockResolvedValue({
        id: "ev-new",
      });
      vi.spyOn(calendarService, "deleteEvent").mockResolvedValue(undefined);
    });

    it("deletes existing cooking blocks and creates new ones", async () => {
      vi.spyOn(calendarService, "listEvents").mockResolvedValue([
        {
          id: "ev-old-1",
          summary: "Cook: Old Recipe (15p + 30c)",
          start: { dateTime: "2026-04-27T18:45:00" },
          end: { dateTime: "2026-04-27T19:30:00" },
        },
        {
          id: "ev-old-2",
          summary: "Cook: Another Old (20c)",
          start: { dateTime: "2026-04-29T19:10:00" },
          end: { dateTime: "2026-04-29T19:30:00" },
        },
        {
          id: "ev-personal",
          summary: "Team standup",
          start: { dateTime: "2026-04-28T09:00:00" },
          end: { dateTime: "2026-04-28T09:30:00" },
        },
      ]);

      const recipe = await recipeRepo.create({
        title: "New Stir Fry",
        source: "manual",
        instructions: "Stir fry it",
        prepMinutes: 10,
        cookMinutes: 15,
      });

      const plan = await mealPlanRepo.create({
        name: "Week of Apr 27",
        weekStart: "2026-04-27",
        weekEnd: "2026-05-03",
        entries: [
          {
            dayOfWeek: 0,
            mealType: "dinner",
            recipeId: recipe.id,
            category: "exploit",
          },
        ],
      });

      const respond = vi.fn();
      await tool.handler({ mealPlanId: plan.id }, { respond });

      const result = respond.mock.calls[0][1];
      expect(result.ok).toBe(true);
      expect(result.calendarConnected).toBe(true);

      // Should delete only cooking blocks, not personal events
      expect(calendarService.deleteEvent).toHaveBeenCalledTimes(2);
      expect(calendarService.deleteEvent).toHaveBeenCalledWith(
        "fake-token",
        "ev-old-1"
      );
      expect(calendarService.deleteEvent).toHaveBeenCalledWith(
        "fake-token",
        "ev-old-2"
      );

      // Should create new event for current plan
      expect(calendarService.createEvent).toHaveBeenCalledTimes(1);
      expect(result.eventsDeleted).toBe(2);
      expect(result.eventsCreated).toHaveLength(1);
      expect(result.eventsCreated[0].title).toContain("New Stir Fry");
    });

    it("also deletes Prep: blocks", async () => {
      vi.spyOn(calendarService, "listEvents").mockResolvedValue([
        {
          id: "ev-prep",
          summary: "Prep: Chicken Stock",
          start: { dateTime: "2026-04-27T14:00:00" },
          end: { dateTime: "2026-04-27T15:00:00" },
        },
      ]);

      const plan = await mealPlanRepo.create({
        name: "Week of Apr 27",
        weekStart: "2026-04-27",
        weekEnd: "2026-05-03",
        entries: [],
      });

      const respond = vi.fn();
      await tool.handler({ mealPlanId: plan.id }, { respond });

      expect(calendarService.deleteEvent).toHaveBeenCalledWith(
        "fake-token",
        "ev-prep"
      );
    });

    it("handles plan with no cooking nights (all deleted)", async () => {
      vi.spyOn(calendarService, "listEvents").mockResolvedValue([
        {
          id: "ev-old",
          summary: "Cook: Something (20c)",
          start: { dateTime: "2026-04-27T19:10:00" },
          end: { dateTime: "2026-04-27T19:30:00" },
        },
      ]);

      const plan = await mealPlanRepo.create({
        name: "Week of Apr 27",
        weekStart: "2026-04-27",
        weekEnd: "2026-05-03",
        entries: [
          {
            dayOfWeek: 0,
            mealType: "dinner",
            customTitle: "Takeout",
            category: "skip",
          },
        ],
      });

      const respond = vi.fn();
      await tool.handler({ mealPlanId: plan.id }, { respond });

      const result = respond.mock.calls[0][1];
      expect(result.eventsDeleted).toBe(1);
      expect(result.eventsCreated).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
    });

    it("does not delete non-cooking events", async () => {
      vi.spyOn(calendarService, "listEvents").mockResolvedValue([
        {
          id: "ev-meeting",
          summary: "Dinner with friends",
          start: { dateTime: "2026-04-28T18:00:00" },
          end: { dateTime: "2026-04-28T20:00:00" },
        },
        {
          id: "ev-workout",
          summary: "Cooking class",
          start: { dateTime: "2026-04-29T17:00:00" },
          end: { dateTime: "2026-04-29T19:00:00" },
        },
      ]);

      const plan = await mealPlanRepo.create({
        name: "Week of Apr 27",
        weekStart: "2026-04-27",
        weekEnd: "2026-05-03",
        entries: [],
      });

      const respond = vi.fn();
      await tool.handler({ mealPlanId: plan.id }, { respond });

      expect(calendarService.deleteEvent).not.toHaveBeenCalled();
    });

    it("uses correct date range for listEvents", async () => {
      vi.spyOn(calendarService, "listEvents").mockResolvedValue([]);

      const plan = await mealPlanRepo.create({
        name: "Week of Apr 27",
        weekStart: "2026-04-27",
        weekEnd: "2026-05-03",
        entries: [],
      });

      const respond = vi.fn();
      await tool.handler({ mealPlanId: plan.id }, { respond });

      expect(calendarService.listEvents).toHaveBeenCalledWith(
        "fake-token",
        "2026-04-27T00:00:00",
        "2026-05-03T23:59:59"
      );
    });

    it("respects dinnerTargetTime parameter", async () => {
      vi.spyOn(calendarService, "listEvents").mockResolvedValue([]);

      const recipe = await recipeRepo.create({
        title: "Late Dinner",
        source: "manual",
        instructions: "Cook it",
        prepMinutes: 10,
        cookMinutes: 30,
      });

      const plan = await mealPlanRepo.create({
        name: "Week of Apr 27",
        weekStart: "2026-04-27",
        weekEnd: "2026-05-03",
        entries: [
          {
            dayOfWeek: 0,
            mealType: "dinner",
            recipeId: recipe.id,
            category: "exploit",
          },
        ],
      });

      const respond = vi.fn();
      await tool.handler(
        { mealPlanId: plan.id, dinnerTargetTime: "20:00" },
        { respond }
      );

      const result = respond.mock.calls[0][1];
      expect(result.eventsCreated[0].end).toBe("20:00");
      expect(result.eventsCreated[0].start).toBe("19:20");
    });

    it("skips custom-title entries with no recipe", async () => {
      vi.spyOn(calendarService, "listEvents").mockResolvedValue([]);

      const plan = await mealPlanRepo.create({
        name: "Week of Apr 27",
        weekStart: "2026-04-27",
        weekEnd: "2026-05-03",
        entries: [
          {
            dayOfWeek: 0,
            mealType: "dinner",
            customTitle: "Takeout pizza",
            category: "exploit",
          },
        ],
      });

      const respond = vi.fn();
      await tool.handler({ mealPlanId: plan.id }, { respond });

      const result = respond.mock.calls[0][1];
      expect(result.eventsCreated).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toContain("Takeout pizza");
    });

    it("skips recipes with no time estimate", async () => {
      vi.spyOn(calendarService, "listEvents").mockResolvedValue([]);

      const recipe = await recipeRepo.create({
        title: "Mystery Dish",
        source: "manual",
        instructions: "Figure it out",
      });

      const plan = await mealPlanRepo.create({
        name: "Week of Apr 27",
        weekStart: "2026-04-27",
        weekEnd: "2026-05-03",
        entries: [
          {
            dayOfWeek: 0,
            mealType: "dinner",
            recipeId: recipe.id,
            category: "exploit",
          },
        ],
      });

      const respond = vi.fn();
      await tool.handler({ mealPlanId: plan.id }, { respond });

      const result = respond.mock.calls[0][1];
      expect(result.eventsCreated).toHaveLength(0);
      expect(result.skipped[0].reason).toContain("no time estimate");
    });

    it("handles cook-only recipes (no prep time)", async () => {
      vi.spyOn(calendarService, "listEvents").mockResolvedValue([]);

      const recipe = await recipeRepo.create({
        title: "Quick Chili",
        source: "manual",
        instructions: "Dump and press",
        cookMinutes: 45,
      });

      const plan = await mealPlanRepo.create({
        name: "Week of Apr 27",
        weekStart: "2026-04-27",
        weekEnd: "2026-05-03",
        entries: [
          {
            dayOfWeek: 0,
            mealType: "dinner",
            recipeId: recipe.id,
            category: "exploit",
          },
        ],
      });

      const respond = vi.fn();
      await tool.handler({ mealPlanId: plan.id }, { respond });

      const result = respond.mock.calls[0][1];
      expect(result.eventsCreated[0].title).toBe("Cook: Quick Chili (45c)");
    });

    it("marks explore recipes in calendar event description", async () => {
      vi.spyOn(calendarService, "listEvents").mockResolvedValue([]);

      const recipe = await recipeRepo.create({
        title: "Ethiopian Stew",
        source: "manual",
        instructions: "Make stew",
        prepMinutes: 20,
        cookMinutes: 60,
      });

      const plan = await mealPlanRepo.create({
        name: "Week of Apr 27",
        weekStart: "2026-04-27",
        weekEnd: "2026-05-03",
        entries: [
          {
            dayOfWeek: 0,
            mealType: "dinner",
            recipeId: recipe.id,
            category: "explore",
          },
        ],
      });

      const respond = vi.fn();
      await tool.handler({ mealPlanId: plan.id }, { respond });

      const eventArg = (calendarService.createEvent as any).mock.calls[0][1];
      expect(eventArg.description).toContain("New recipe!");
    });

    it("uses dinner_target_time from preferences when not passed", async () => {
      vi.spyOn(calendarService, "listEvents").mockResolvedValue([]);
      await profileRepo.setPreference("dinner_target_time", "20:00");

      const recipe = await recipeRepo.create({
        title: "Late Dinner",
        source: "manual",
        instructions: "Cook it",
        prepMinutes: 10,
        cookMinutes: 30,
      });

      const plan = await mealPlanRepo.create({
        name: "Week of Apr 27",
        weekStart: "2026-04-27",
        weekEnd: "2026-05-03",
        entries: [
          {
            dayOfWeek: 0,
            mealType: "dinner",
            recipeId: recipe.id,
            category: "exploit",
          },
        ],
      });

      const respond = vi.fn();
      await tool.handler({ mealPlanId: plan.id }, { respond });

      const result = respond.mock.calls[0][1];
      expect(result.eventsCreated[0].end).toBe("20:00");
      expect(result.eventsCreated[0].start).toBe("19:20");
    });

    it("handles errors gracefully", async () => {
      vi.spyOn(calendarService, "listEvents").mockRejectedValue(
        new Error("API rate limit")
      );

      const plan = await mealPlanRepo.create({
        name: "Week of Apr 27",
        weekStart: "2026-04-27",
        weekEnd: "2026-05-03",
        entries: [],
      });

      const respond = vi.fn();
      await tool.handler({ mealPlanId: plan.id }, { respond });

      expect(respond).toHaveBeenCalledWith(
        false,
        expect.objectContaining({ ok: false, error: "API rate limit" })
      );
    });

    it("handles empty existing calendar (no events to delete)", async () => {
      vi.spyOn(calendarService, "listEvents").mockResolvedValue([]);

      const recipe = await recipeRepo.create({
        title: "Simple Pasta",
        source: "manual",
        instructions: "Boil pasta",
        cookMinutes: 20,
      });

      const plan = await mealPlanRepo.create({
        name: "Week of Apr 27",
        weekStart: "2026-04-27",
        weekEnd: "2026-05-03",
        entries: [
          {
            dayOfWeek: 2,
            mealType: "dinner",
            recipeId: recipe.id,
            category: "exploit",
          },
        ],
      });

      const respond = vi.fn();
      await tool.handler({ mealPlanId: plan.id }, { respond });

      const result = respond.mock.calls[0][1];
      expect(result.eventsDeleted).toBe(0);
      expect(result.eventsCreated).toHaveLength(1);
      expect(calendarService.deleteEvent).not.toHaveBeenCalled();
    });
  });
});
