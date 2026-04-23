import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { UserProfileRepository } from "../../src/repositories/user-profile.repo.js";
import { MealPlanRepository } from "../../src/repositories/meal-plan.repo.js";
import { RecipeRepository } from "../../src/repositories/recipe.repo.js";
import { createBlockCookingTimeTool } from "../../src/tools/calendar-block.js";
import { CalendarService } from "../../src/services/calendar.service.js";

// Spec: specs/meal-planning/weekly-plan.md — block_cooking_time tool

describe("block_cooking_time tool", () => {
  let profileRepo: UserProfileRepository;
  let mealPlanRepo: MealPlanRepository;
  let recipeRepo: RecipeRepository;
  let calendarService: CalendarService;
  let tool: ReturnType<typeof createBlockCookingTimeTool>;

  beforeEach(() => {
    const { db } = createTestDb();
    profileRepo = new UserProfileRepository(db);
    mealPlanRepo = new MealPlanRepository(db);
    recipeRepo = new RecipeRepository(db);
    calendarService = new CalendarService();
    tool = createBlockCookingTimeTool(profileRepo, mealPlanRepo, recipeRepo, calendarService);
  });

  it("has correct name", () => {
    expect(tool.name).toBe("block_cooking_time");
  });

  it("returns error for nonexistent meal plan", async () => {
    const respond = vi.fn();
    await tool.handler({ mealPlanId: "nonexistent" }, { respond });

    expect(respond).toHaveBeenCalledWith(false, expect.objectContaining({
      ok: false,
      error: "Meal plan not found",
    }));
  });

  describe("without calendar connected", () => {
    it("returns schedule for agent to relay instead of creating events", async () => {
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
          { dayOfWeek: 0, mealType: "dinner", recipeId: recipe.id, category: "exploit" },
          { dayOfWeek: 3, mealType: "dinner", customTitle: "Leftover night", category: "leftover" },
        ],
      });

      const respond = vi.fn();
      await tool.handler({ mealPlanId: plan.id }, { respond });

      expect(respond).toHaveBeenCalledWith(true, expect.objectContaining({ ok: true }));
      const result = respond.mock.calls[0][1];
      expect(result.calendarConnected).toBe(false);
      expect(result.action).toBe("tell_user");
      expect(result.schedule).toHaveLength(1);
      expect(result.schedule[0].title).toContain("Gochujang Chicken");
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toContain("leftover");
    });
  });

  describe("with calendar connected", () => {
    beforeEach(async () => {
      await profileRepo.setPreference("google_calendar_token", "fake-token");
      vi.spyOn(calendarService, "createEvent").mockResolvedValue({ id: "ev-created" });
    });

    it("creates calendar events for cooking nights", async () => {
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
          { dayOfWeek: 0, mealType: "dinner", recipeId: recipe.id, category: "exploit" },
        ],
      });

      const respond = vi.fn();
      await tool.handler({ mealPlanId: plan.id }, { respond });

      expect(respond).toHaveBeenCalledWith(true, expect.objectContaining({ ok: true }));
      const result = respond.mock.calls[0][1];
      expect(result.calendarConnected).toBe(true);
      expect(result.eventsCreated).toHaveLength(1);
      expect(result.eventsCreated[0].title).toBe("Cook: Gochujang Chicken (20p + 40c)");
      expect(result.eventsCreated[0].date).toBe("2026-04-27");
      // 19:30 - 60min = 18:30
      expect(result.eventsCreated[0].start).toBe("18:30");
      expect(result.eventsCreated[0].end).toBe("19:30");
    });

    it("calculates start time from dinner target minus total time", async () => {
      const recipe = await recipeRepo.create({
        title: "Slow Braise",
        source: "manual",
        instructions: "Braise it",
        prepMinutes: 30,
        cookMinutes: 180,
      });

      const plan = await mealPlanRepo.create({
        name: "Week of Apr 27",
        weekStart: "2026-04-27",
        weekEnd: "2026-05-03",
        entries: [
          { dayOfWeek: 5, mealType: "dinner", recipeId: recipe.id, category: "exploit" },
        ],
      });

      const respond = vi.fn();
      await tool.handler({ mealPlanId: plan.id, dinnerTargetTime: "19:00" }, { respond });

      const result = respond.mock.calls[0][1];
      expect(result.eventsCreated[0].start).toBe("15:30"); // 19:00 - 210min
      expect(result.eventsCreated[0].end).toBe("19:00");
    });

    it("skips leftover and skip nights", async () => {
      const recipe = await recipeRepo.create({
        title: "Pasta",
        source: "manual",
        instructions: "Cook pasta",
        prepMinutes: 10,
        cookMinutes: 20,
      });

      const plan = await mealPlanRepo.create({
        name: "Week of Apr 27",
        weekStart: "2026-04-27",
        weekEnd: "2026-05-03",
        entries: [
          { dayOfWeek: 0, mealType: "dinner", recipeId: recipe.id, category: "exploit" },
          { dayOfWeek: 1, mealType: "dinner", customTitle: "Leftover night", category: "leftover" },
          { dayOfWeek: 3, mealType: "dinner", customTitle: "Takeout", category: "skip" },
        ],
      });

      const respond = vi.fn();
      await tool.handler({ mealPlanId: plan.id }, { respond });

      const result = respond.mock.calls[0][1];
      expect(result.eventsCreated).toHaveLength(1);
      expect(result.skipped).toHaveLength(2);
      expect(result.skipped[0].reason).toContain("leftover");
      expect(result.skipped[1].reason).toContain("skip");
    });

    it("calls Google Calendar API with correct event shape", async () => {
      const recipe = await recipeRepo.create({
        title: "Stir Fry",
        source: "manual",
        instructions: "Stir fry it",
        prepMinutes: 15,
        cookMinutes: 10,
      });

      const plan = await mealPlanRepo.create({
        name: "Week of Apr 27",
        weekStart: "2026-04-27",
        weekEnd: "2026-05-03",
        entries: [
          { dayOfWeek: 2, mealType: "dinner", recipeId: recipe.id, category: "exploit" },
        ],
      });

      const respond = vi.fn();
      await tool.handler({ mealPlanId: plan.id }, { respond });

      expect(calendarService.createEvent).toHaveBeenCalledWith(
        "fake-token",
        expect.objectContaining({
          summary: "Cook: Stir Fry (15p + 10c)",
          start: { dateTime: "2026-04-29T19:05:00" },
          end: { dateTime: "2026-04-29T19:30:00" },
          colorId: "9",
        })
      );
    });

    it("marks explore recipes in description", async () => {
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
          { dayOfWeek: 4, mealType: "dinner", recipeId: recipe.id, category: "explore" },
        ],
      });

      const respond = vi.fn();
      await tool.handler({ mealPlanId: plan.id }, { respond });

      // Check the description passed to createEvent
      const eventArg = (calendarService.createEvent as any).mock.calls[0][1];
      expect(eventArg.description).toContain("New recipe!");
    });

    it("handles recipes with only cook time (no prep)", async () => {
      const recipe = await recipeRepo.create({
        title: "Instant Pot Chili",
        source: "manual",
        instructions: "Dump and press",
        cookMinutes: 45,
      });

      const plan = await mealPlanRepo.create({
        name: "Week of Apr 27",
        weekStart: "2026-04-27",
        weekEnd: "2026-05-03",
        entries: [
          { dayOfWeek: 0, mealType: "dinner", recipeId: recipe.id, category: "exploit" },
        ],
      });

      const respond = vi.fn();
      await tool.handler({ mealPlanId: plan.id }, { respond });

      const result = respond.mock.calls[0][1];
      expect(result.eventsCreated[0].title).toBe("Cook: Instant Pot Chili (45c)");
    });

    it("skips recipes with no time estimate", async () => {
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
          { dayOfWeek: 0, mealType: "dinner", recipeId: recipe.id, category: "exploit" },
        ],
      });

      const respond = vi.fn();
      await tool.handler({ mealPlanId: plan.id }, { respond });

      const result = respond.mock.calls[0][1];
      expect(result.eventsCreated).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toContain("no time estimate");
    });

    it("uses dinner_target_time from preferences when not passed", async () => {
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
          { dayOfWeek: 0, mealType: "dinner", recipeId: recipe.id, category: "exploit" },
        ],
      });

      const respond = vi.fn();
      await tool.handler({ mealPlanId: plan.id }, { respond });

      const result = respond.mock.calls[0][1];
      expect(result.eventsCreated[0].end).toBe("20:00");
      expect(result.eventsCreated[0].start).toBe("19:20"); // 20:00 - 40min
    });
  });
});
