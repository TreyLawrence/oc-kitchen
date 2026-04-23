import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { RecipeRepository } from "../../src/repositories/recipe.repo.js";
import { createGeneratePrepListTool } from "../../src/tools/meal-plan-prep-list.js";

// Spec: specs/meal-planning/weekly-plan.md — generate_prep_list tool

describe("generate_prep_list tool", () => {
  let recipeRepo: RecipeRepository;
  let tool: ReturnType<typeof createGeneratePrepListTool>;

  beforeEach(() => {
    const { db } = createTestDb();
    recipeRepo = new RecipeRepository(db);
    tool = createGeneratePrepListTool(recipeRepo);
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
});
