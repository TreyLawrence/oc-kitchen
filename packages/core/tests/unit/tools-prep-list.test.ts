import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { RecipeRepository } from "../../src/repositories/recipe.repo.js";
import { MealPlanRepository } from "../../src/repositories/meal-plan.repo.js";
import { UserProfileRepository } from "../../src/repositories/user-profile.repo.js";
import { createGeneratePrepListTool } from "../../src/tools/meal-plan-prep-list.js";

// Spec: specs/meal-planning/weekly-plan.md — generate_prep_list tool

describe("generate_prep_list tool", () => {
  let recipeRepo: RecipeRepository;
  let mealPlanRepo: MealPlanRepository;
  let profileRepo: UserProfileRepository;
  let tool: ReturnType<typeof createGeneratePrepListTool>;

  beforeEach(() => {
    const { db } = createTestDb();
    recipeRepo = new RecipeRepository(db);
    mealPlanRepo = new MealPlanRepository(db);
    profileRepo = new UserProfileRepository(db);
    tool = createGeneratePrepListTool(recipeRepo, mealPlanRepo, profileRepo);
  });

  it("has correct name", () => {
    expect(tool.name).toBe("generate_prep_list");
  });

  it("returns recipe context and instructions for the agent", async () => {
    const recipe = await recipeRepo.create({
      title: "Gochujang Chicken",
      source: "manual",
      instructions: "1. Dice onion\n2. Mince garlic\n3. Mix sauce\n4. Sear chicken\n5. Bake at 425",
      prepMinutes: 20,
      cookMinutes: 40,
      ingredients: [
        { name: "chicken thighs", quantity: 2, unit: "lbs", category: "protein" },
        { name: "gochujang", quantity: 3, unit: "tbsp", category: "pantry" },
        { name: "yellow onion", quantity: 1, unit: "count", category: "produce" },
        { name: "garlic", quantity: 6, unit: "cloves", category: "produce" },
      ],
    });

    const respond = vi.fn();
    await tool.handler({ recipeId: recipe.id, helperName: "Maria" }, { respond });

    expect(respond).toHaveBeenCalledWith(true, expect.objectContaining({ ok: true }));
    const result = respond.mock.calls[0][1];
    expect(result.action).toBe("generate_prep_list");
    expect(result.recipe.title).toBe("Gochujang Chicken");
    expect(result.recipe.ingredients).toHaveLength(4);
    expect(result.recipe.instructions).toContain("Dice onion");
    expect(result.recipe.prepMinutes).toBe(20);
    expect(result.helperName).toBe("Maria");
    expect(result.instructions).toContain("Maria");
    expect(result.instructions).toContain("chopping");
  });

  it("uses default helper name when not provided", async () => {
    const recipe = await recipeRepo.create({
      title: "Simple Pasta",
      source: "manual",
      instructions: "1. Boil water\n2. Cook pasta",
    });

    const respond = vi.fn();
    await tool.handler({ recipeId: recipe.id }, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.helperName).toBe("your helper");
    expect(result.instructions).toContain("the helper");
  });

  it("returns error for nonexistent recipe", async () => {
    const respond = vi.fn();
    await tool.handler({ recipeId: "nonexistent" }, { respond });

    expect(respond).toHaveBeenCalledWith(false, expect.objectContaining({
      ok: false,
      error: "Recipe not found",
    }));
  });

  it("includes ingredients and instructions for agent to extract prep tasks", async () => {
    const recipe = await recipeRepo.create({
      title: "Complex Dish",
      source: "manual",
      instructions: "1. Chop vegetables\n2. Marinate meat overnight\n3. Measure spices\n4. Heat oil in wok\n5. Stir fry",
      prepMinutes: 30,
      ingredients: [
        { name: "beef", quantity: 1, unit: "lb", category: "protein" },
        { name: "broccoli", quantity: 2, unit: "cups", category: "produce" },
        { name: "soy sauce", quantity: 2, unit: "tbsp", category: "pantry" },
      ],
    });

    const respond = vi.fn();
    await tool.handler({ recipeId: recipe.id, helperName: "Alex" }, { respond });

    const result = respond.mock.calls[0][1];
    // The tool provides the raw recipe for the agent to extract prep tasks
    expect(result.recipe.ingredients).toHaveLength(3);
    expect(result.recipe.instructions).toContain("Chop vegetables");
    expect(result.recipe.instructions).toContain("Marinate meat");
    // Instructions tell the agent what qualifies as delegatable prep
    expect(result.instructions).toContain("measuring");
  });

  // ─── Household context ─────────────────────────────────

  it("includes household context with defaults when no preferences set", async () => {
    const recipe = await recipeRepo.create({
      title: "Simple Pasta",
      source: "manual",
      instructions: "1. Boil water\n2. Cook pasta",
    });

    const respond = vi.fn();
    await tool.handler({ recipeId: recipe.id }, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.household).toEqual({
      householdSize: 2,
      dinnerTargetTime: "19:30",
      helpers: [],
    });
  });

  it("includes household context from user preferences", async () => {
    await profileRepo.setPreference("household_size", 4);
    await profileRepo.setPreference("dinner_target_time", "18:00");
    await profileRepo.setPreference("helpers", ["Maria", "James"]);

    const recipe = await recipeRepo.create({
      title: "Simple Pasta",
      source: "manual",
      instructions: "1. Boil water\n2. Cook pasta",
    });

    const respond = vi.fn();
    await tool.handler({ recipeId: recipe.id }, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.household).toEqual({
      householdSize: 4,
      dinnerTargetTime: "18:00",
      helpers: ["Maria", "James"],
    });
  });

  it("falls back helperName to first helper from preferences", async () => {
    await profileRepo.setPreference("helpers", ["Maria", "James"]);

    const recipe = await recipeRepo.create({
      title: "Simple Pasta",
      source: "manual",
      instructions: "1. Boil water\n2. Cook pasta",
    });

    const respond = vi.fn();
    await tool.handler({ recipeId: recipe.id }, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.helperName).toBe("Maria");
    expect(result.instructions).toContain("Maria");
  });

  // ─── Validation ────────────────────────────────────────

  it("returns error when neither recipeId nor mealPlanId provided", async () => {
    const respond = vi.fn();
    await tool.handler({}, { respond });

    expect(respond).toHaveBeenCalledWith(false, expect.objectContaining({
      ok: false,
      error: "Either recipeId or mealPlanId + dayOfWeek is required",
    }));
  });

  it("returns error when mealPlanId provided without dayOfWeek", async () => {
    const respond = vi.fn();
    await tool.handler({ mealPlanId: "some-plan" }, { respond });

    expect(respond).toHaveBeenCalledWith(false, expect.objectContaining({
      ok: false,
      error: "dayOfWeek is required when using mealPlanId",
    }));
  });

  // ─── Meal plan day mode ────────────────────────────────

  it("returns error when meal plan not found", async () => {
    const respond = vi.fn();
    await tool.handler({ mealPlanId: "nonexistent", dayOfWeek: 0 }, { respond });

    expect(respond).toHaveBeenCalledWith(false, expect.objectContaining({
      ok: false,
      error: "Meal plan not found",
    }));
  });

  it("returns error when no recipes found for given day", async () => {
    const recipe = await recipeRepo.create({
      title: "Monday Dinner",
      source: "manual",
      instructions: "Cook it",
    });

    const plan = await mealPlanRepo.create({
      name: "Test Week",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [
        { dayOfWeek: 0, mealType: "dinner", recipeId: recipe.id, category: "exploit" },
      ],
    });

    const respond = vi.fn();
    await tool.handler({ mealPlanId: plan.id, dayOfWeek: 3 }, { respond });

    expect(respond).toHaveBeenCalledWith(false, expect.objectContaining({
      ok: false,
      error: "No recipes found for that day",
    }));
  });

  it("fetches all recipes for a meal plan day", async () => {
    const dinner = await recipeRepo.create({
      title: "Gochujang Chicken",
      source: "manual",
      instructions: "1. Dice onion\n2. Sear chicken\n3. Bake",
      prepMinutes: 20,
      cookMinutes: 40,
      ingredients: [
        { name: "chicken thighs", quantity: 2, unit: "lbs", category: "protein" },
        { name: "yellow onion", quantity: 1, unit: "count", category: "produce" },
      ],
    });

    const prepRecipe = await recipeRepo.create({
      title: "Chicken Stock",
      source: "manual",
      instructions: "1. Chop mirepoix\n2. Simmer 2 hours",
      prepMinutes: 15,
      cookMinutes: 120,
      ingredients: [
        { name: "chicken bones", quantity: 2, unit: "lbs", category: "protein" },
        { name: "carrots", quantity: 3, unit: "count", category: "produce" },
      ],
    });

    const plan = await mealPlanRepo.create({
      name: "Test Week",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [
        { dayOfWeek: 0, mealType: "dinner", recipeId: dinner.id, category: "exploit" },
        { dayOfWeek: 0, mealType: "dinner", recipeId: prepRecipe.id, category: "prep", customTitle: "Prep: Chicken Stock" },
        { dayOfWeek: 1, mealType: "dinner", customTitle: "Leftover: Gochujang Chicken", category: "leftover" },
      ],
    });

    const respond = vi.fn();
    await tool.handler({ mealPlanId: plan.id, dayOfWeek: 0, helperName: "Maria" }, { respond });

    expect(respond).toHaveBeenCalledWith(true, expect.objectContaining({ ok: true }));
    const result = respond.mock.calls[0][1];
    expect(result.action).toBe("generate_prep_list");
    expect(result.recipes).toHaveLength(2);
    expect(result.recipes[0].title).toBe("Gochujang Chicken");
    expect(result.recipes[0].ingredients).toHaveLength(2);
    expect(result.recipes[0].entryCategory).toBe("exploit");
    expect(result.recipes[1].title).toBe("Chicken Stock");
    expect(result.recipes[1].entryCategory).toBe("prep");
    expect(result.helperName).toBe("Maria");
    expect(result.household).toBeDefined();
    // Should not have singular recipe key in plan mode
    expect(result.recipe).toBeUndefined();
  });

  it("skips entries without recipeId in meal plan day mode", async () => {
    const recipe = await recipeRepo.create({
      title: "Tuesday Dinner",
      source: "manual",
      instructions: "Cook it",
      prepMinutes: 15,
    });

    const plan = await mealPlanRepo.create({
      name: "Test Week",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [
        { dayOfWeek: 2, mealType: "dinner", recipeId: recipe.id, category: "exploit" },
        { dayOfWeek: 2, mealType: "lunch", customTitle: "Leftover: Monday's soup", category: "leftover" },
      ],
    });

    const respond = vi.fn();
    await tool.handler({ mealPlanId: plan.id, dayOfWeek: 2 }, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.recipes).toHaveLength(1);
    expect(result.recipes[0].title).toBe("Tuesday Dinner");
  });
});
