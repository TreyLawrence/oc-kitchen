import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { UserProfileRepository } from "../../src/repositories/user-profile.repo.js";
import { RecipeRepository } from "../../src/repositories/recipe.repo.js";
import { InventoryRepository } from "../../src/repositories/inventory.repo.js";
import { CookLogRepository } from "../../src/repositories/cook-log.repo.js";
import { createSuggestMealPlanTool } from "../../src/tools/meal-plan-suggest.js";

// Spec: specs/meal-planning/weekly-plan.md — suggest_meal_plan tool

describe("suggest_meal_plan tool", () => {
  let profileRepo: UserProfileRepository;
  let recipeRepo: RecipeRepository;
  let inventoryRepo: InventoryRepository;
  let cookLogRepo: CookLogRepository;
  let tool: ReturnType<typeof createSuggestMealPlanTool>;

  beforeEach(() => {
    const { db } = createTestDb();
    profileRepo = new UserProfileRepository(db);
    recipeRepo = new RecipeRepository(db);
    inventoryRepo = new InventoryRepository(db);
    cookLogRepo = new CookLogRepository(db);
    tool = createSuggestMealPlanTool(profileRepo, recipeRepo, inventoryRepo, cookLogRepo);
  });

  it("has correct name", () => {
    expect(tool.name).toBe("suggest_meal_plan");
  });

  it("returns context with empty profile and no recipes", async () => {
    const respond = vi.fn();
    await tool.handler({ weekStart: "2026-04-27" }, { respond });

    expect(respond).toHaveBeenCalledWith(true, expect.objectContaining({ ok: true }));
    const result = respond.mock.calls[0][1];
    expect(result.action).toBe("build_meal_plan");
    expect(result.context.profile.householdSize).toBe(2);
    expect(result.context.profile.exploreRatio).toBe(0.3);
    expect(result.context.profile.equipment).toEqual([]);
    expect(result.context.recipeLibrary.bangers).toEqual([]);
    expect(result.context.recipeLibrary.makeAgains).toEqual([]);
    expect(result.context.recipeLibrary.tweaks).toEqual([]);
    expect(result.context.inventory.expiringItems).toEqual([]);
    expect(result.context.inventory.leftovers).toEqual([]);
    expect(result.instructions).toContain("create_meal_plan");
  });

  it("includes user preferences in context", async () => {
    await profileRepo.addEquipment([
      { name: "Big Green Egg", category: "grill" },
      { name: "Wok", category: "cookware" },
    ]);
    await profileRepo.setPreference("explore_ratio", 0.5);
    await profileRepo.setPreference("household_size", 3);
    await profileRepo.setPreference("cuisine_affinities", ["korean", "mexican"]);

    const respond = vi.fn();
    await tool.handler({ weekStart: "2026-04-27" }, { respond });

    const ctx = respond.mock.calls[0][1].context;
    expect(ctx.profile.equipment).toEqual(["Big Green Egg", "Wok"]);
    expect(ctx.profile.exploreRatio).toBe(0.5);
    expect(ctx.profile.householdSize).toBe(3);
    expect(ctx.profile.preferences.cuisine_affinities).toEqual(["korean", "mexican"]);
  });

  it("categorizes recipes by verdict", async () => {
    // Create recipes with different verdicts
    const banger = await recipeRepo.create({
      title: "Gochujang Chicken", source: "manual", instructions: "Cook it",
    });
    await cookLogRepo.logCook({ recipeId: banger.id });
    await cookLogRepo.logCook({ recipeId: banger.id, verdict: "banger" });

    const makeAgain = await recipeRepo.create({
      title: "Mapo Tofu", source: "imported", instructions: "Fry it",
    });
    await cookLogRepo.logCook({ recipeId: makeAgain.id });
    await cookLogRepo.logCook({ recipeId: makeAgain.id, verdict: "make_again" });

    const tweak = await recipeRepo.create({
      title: "Pad Thai", source: "manual", instructions: "Stir fry",
    });
    await cookLogRepo.logCook({ recipeId: tweak.id });
    await cookLogRepo.logCook({ recipeId: tweak.id, verdict: "try_again_with_tweaks" });

    const uncooked = await recipeRepo.create({
      title: "New Recipe", source: "ai_generated", instructions: "TBD",
    });

    const respond = vi.fn();
    await tool.handler({ weekStart: "2026-04-27" }, { respond });

    const lib = respond.mock.calls[0][1].context.recipeLibrary;
    expect(lib.bangers).toHaveLength(1);
    expect(lib.bangers[0].title).toBe("Gochujang Chicken");
    expect(lib.makeAgains).toHaveLength(1);
    expect(lib.makeAgains[0].title).toBe("Mapo Tofu");
    expect(lib.tweaks).toHaveLength(1);
    expect(lib.tweaks[0].title).toBe("Pad Thai");
    expect(lib.uncookedCount).toBeGreaterThanOrEqual(1);
  });

  it("includes expiring inventory and leftovers", async () => {
    await inventoryRepo.add([
      { name: "chicken thighs", category: "protein", quantity: 2, unit: "lbs", location: "fridge", expiresAt: "2026-04-25" },
    ]);

    const respond = vi.fn();
    await tool.handler({ weekStart: "2026-04-27" }, { respond });

    const inv = respond.mock.calls[0][1].context.inventory;
    expect(inv.expiringItems).toHaveLength(1);
    expect(inv.expiringItems[0].name).toBe("chicken thighs");
  });

  it("passes through constraints and cooking nights", async () => {
    const respond = vi.fn();
    await tool.handler(
      {
        weekStart: "2026-04-27",
        cookingNights: [
          { dayOfWeek: 0, availableMinutes: 90 },
          { dayOfWeek: 2, availableMinutes: 60 },
        ],
        constraints: {
          preferCuisines: ["korean"],
          quickWeeknight: true,
        },
      },
      { respond }
    );

    const ctx = respond.mock.calls[0][1].context;
    expect(ctx.cookingNights).toHaveLength(2);
    expect(ctx.cookingNights[0].availableMinutes).toBe(90);
    expect(ctx.constraints.preferCuisines).toEqual(["korean"]);
    expect(ctx.constraints.quickWeeknight).toBe(true);
  });

  it("summarizes recipes with timing and tag info", async () => {
    const recipe = await recipeRepo.create({
      title: "Quick Stir Fry",
      source: "manual",
      instructions: "Stir fry everything",
      prepMinutes: 10,
      cookMinutes: 15,
      servings: 2,
      tags: ["quick", "asian"],
    });
    await cookLogRepo.logCook({ recipeId: recipe.id });
    await cookLogRepo.logCook({ recipeId: recipe.id, verdict: "banger" });

    const respond = vi.fn();
    await tool.handler({ weekStart: "2026-04-27" }, { respond });

    const banger = respond.mock.calls[0][1].context.recipeLibrary.bangers[0];
    expect(banger.prepMinutes).toBe(10);
    expect(banger.cookMinutes).toBe(15);
    expect(banger.servings).toBe(2);
    expect(banger.tags).toEqual(["quick", "asian"]);
  });

  it("includes prepHints for recipes needing advance prep", async () => {
    const recipe = await recipeRepo.create({
      title: "Overnight Focaccia",
      source: "manual",
      instructions: "Mix flour, water, yeast. Let the dough rise overnight in the fridge. Shape and bake the next day.",
    });
    await cookLogRepo.logCook({ recipeId: recipe.id });
    await cookLogRepo.logCook({ recipeId: recipe.id, verdict: "banger" });

    const respond = vi.fn();
    await tool.handler({ weekStart: "2026-04-27" }, { respond });

    const bangers = respond.mock.calls[0][1].context.recipeLibrary.bangers;
    const focaccia = bangers.find((r: any) => r.title === "Overnight Focaccia");
    expect(focaccia).toBeDefined();
    expect(focaccia.prepHints).toHaveLength(1);
    expect(focaccia.prepHints[0].keyword).toBe("overnight");
    expect(focaccia.prepHints[0].leadTimeHours).toBe(12);
  });

  it("includes empty prepHints for recipes without advance prep", async () => {
    const recipe = await recipeRepo.create({
      title: "Quick Stir Fry",
      source: "manual",
      instructions: "Heat oil. Add garlic. Cook chicken 5 minutes. Add vegetables. Serve.",
    });
    await cookLogRepo.logCook({ recipeId: recipe.id });
    await cookLogRepo.logCook({ recipeId: recipe.id, verdict: "banger" });

    const respond = vi.fn();
    await tool.handler({ weekStart: "2026-04-27" }, { respond });

    const bangers = respond.mock.calls[0][1].context.recipeLibrary.bangers;
    const stirFry = bangers.find((r: any) => r.title === "Quick Stir Fry");
    expect(stirFry).toBeDefined();
    expect(stirFry.prepHints).toEqual([]);
  });

  it("mentions prep dependencies in instructions", async () => {
    const respond = vi.fn();
    await tool.handler({ weekStart: "2026-04-27" }, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.instructions).toContain("prepHints");
    expect(result.instructions).toContain("dependsOn");
  });

  it("uses explore ratio in instructions", async () => {
    await profileRepo.setPreference("explore_ratio", 0.6);

    const respond = vi.fn();
    await tool.handler({ weekStart: "2026-04-27" }, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.instructions).toContain("60%");
    expect(result.instructions).toContain("40%");
  });
});
