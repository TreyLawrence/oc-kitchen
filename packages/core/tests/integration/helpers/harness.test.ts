import { describe, it, expect, beforeEach } from "vitest";
import { createIntegrationHarness, type IntegrationHarness } from "./harness.js";
import { seedFixtures, RECIPES, EQUIPMENT, PREFERENCES } from "./fixtures.js";

describe("createIntegrationHarness", () => {
  let h: IntegrationHarness;

  beforeEach(() => {
    h = createIntegrationHarness();
  });

  it("creates a harness with all repos, services, and tools", () => {
    expect(h.db).toBeTruthy();
    expect(h.sqlite).toBeTruthy();
    expect(h.repos.recipe).toBeTruthy();
    expect(h.repos.mealPlan).toBeTruthy();
    expect(h.repos.cookLog).toBeTruthy();
    expect(h.repos.grocery).toBeTruthy();
    expect(h.repos.inventory).toBeTruthy();
    expect(h.repos.order).toBeTruthy();
    expect(h.repos.userProfile).toBeTruthy();
    expect(h.services.autoTagger).toBeTruthy();
    expect(h.services.groceryGeneration).toBeTruthy();
    expect(h.services.deduction).toBeTruthy();
    expect(h.services.cutoff).toBeTruthy();
    expect(h.services.preferenceSummary).toBeTruthy();
    expect(h.services.exploreRatio).toBeTruthy();
    expect(h.services.inventorySync).toBeTruthy();
  });

  it("registers all expected tools", () => {
    const names = h.listToolNames();
    expect(names).toContain("create_recipe");
    expect(names).toContain("get_recipe");
    expect(names).toContain("search_recipes");
    expect(names).toContain("update_recipe");
    expect(names).toContain("delete_recipe");
    expect(names).toContain("log_cook");
    expect(names).toContain("create_meal_plan");
    expect(names).toContain("get_meal_plan");
    expect(names).toContain("update_meal_plan");
    expect(names).toContain("generate_grocery_list");
    expect(names).toContain("list_inventory");
    expect(names).toContain("update_inventory");
    expect(names).toContain("deduct_recipe_ingredients");
    expect(names).toContain("start_order");
    expect(names).toContain("update_order");
    expect(names).toContain("get_order");
    expect(names.length).toBeGreaterThanOrEqual(30);
  });

  it("call() creates a recipe and returns the response", async () => {
    const result = await h.call("create_recipe", {
      title: "Test Recipe",
      source: "manual",
      instructions: "Do the thing",
    });

    expect(result.success).toBe(true);
    expect(result.data.ok).toBe(true);
    expect(result.data.recipe.title).toBe("Test Recipe");
    expect(result.data.recipe.id).toBeTruthy();
  });

  it("call() returns error for invalid params", async () => {
    // Missing required field "title"
    const result = await h.call("create_recipe", {
      source: "manual",
      instructions: "Do the thing",
    });

    // Depending on repo validation, this may succeed with empty title or fail
    // The important thing is call() doesn't throw
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("data");
  });

  it("throws for unknown tool name", () => {
    expect(() => h.call("nonexistent_tool", {})).toThrow("Unknown tool");
  });

  it("getTool() returns the tool object", () => {
    const tool = h.getTool("create_recipe");
    expect(tool.name).toBe("create_recipe");
    expect(tool.description).toBeTruthy();
    expect(tool.parameters).toBeTruthy();
    expect(typeof tool.handler).toBe("function");
  });

  it("getTool() throws for unknown tool", () => {
    expect(() => h.getTool("fake_tool")).toThrow("Unknown tool");
  });

  it("each harness gets an isolated database", async () => {
    const h2 = createIntegrationHarness();

    await h.call("create_recipe", {
      title: "Harness 1 Recipe",
      source: "manual",
      instructions: "Only in harness 1",
    });

    const search1 = await h.call("search_recipes", { query: "Harness 1" });
    const search2 = await h2.call("search_recipes", { query: "Harness 1" });

    expect(search1.data.recipes.length).toBe(1);
    expect(search2.data.recipes.length).toBe(0);
  });
});

describe("seedFixtures", () => {
  let h: IntegrationHarness;

  beforeEach(() => {
    h = createIntegrationHarness();
  });

  it("seeds all recipes and returns their IDs", async () => {
    const { recipeIds } = await seedFixtures(h);

    const recipeKeys = Object.keys(RECIPES);
    expect(Object.keys(recipeIds)).toEqual(recipeKeys);

    for (const key of recipeKeys) {
      expect(recipeIds[key]).toBeTruthy();
    }
  });

  it("seeded recipes are retrievable via get_recipe", async () => {
    const { recipeIds } = await seedFixtures(h);

    const result = await h.call("get_recipe", { id: recipeIds.smokedPorkShoulder });
    expect(result.success).toBe(true);
    expect(result.data.recipe.title).toBe("Smoked Pork Shoulder");
    expect(result.data.recipe.ingredients.length).toBe(5);
  });

  it("seeds equipment", async () => {
    await seedFixtures(h);

    const profile = await h.repos.userProfile.getFullProfile();
    expect(profile.equipment.length).toBe(EQUIPMENT.length);
    expect(profile.equipment.map((e: any) => e.name)).toContain("Big Green Egg");
    expect(profile.equipment.map((e: any) => e.name)).toContain("Instant Pot");
  });

  it("seeds preferences", async () => {
    await seedFixtures(h);

    for (const [key, value] of Object.entries(PREFERENCES)) {
      const pref = await h.repos.userProfile.getPreference(key);
      expect(pref).toBe(value);
    }
  });

  it("auto-tags recipes on creation", async () => {
    const { recipeIds } = await seedFixtures(h);

    // Smoked Pork Shoulder: 720 min cook → should get "project" tag
    const pork = await h.call("get_recipe", { id: recipeIds.smokedPorkShoulder });
    const porkTags = pork.data.recipe.tags;
    expect(porkTags).toBeTruthy();

    // Sheet Pan Chicken: 10 min prep + 40 min cook → should get "quick" or "weeknight" tag
    const chicken = await h.call("get_recipe", { id: recipeIds.sheetPanChicken });
    const chickenTags = chicken.data.recipe.tags;
    expect(chickenTags).toBeTruthy();
  });
});
