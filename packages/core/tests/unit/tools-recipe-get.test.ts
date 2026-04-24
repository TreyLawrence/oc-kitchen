import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { RecipeRepository } from "../../src/repositories/recipe.repo.js";
import { CookLogRepository } from "../../src/repositories/cook-log.repo.js";
import { createGetRecipeTool } from "../../src/tools/recipe-get.js";

// Spec: specs/recipes/recipe-management.md — get_recipe should include cook log history

describe("get_recipe tool", () => {
  let recipeRepo: RecipeRepository;
  let cookLogRepo: CookLogRepository;
  let tool: ReturnType<typeof createGetRecipeTool>;

  beforeEach(() => {
    const { db } = createTestDb();
    recipeRepo = new RecipeRepository(db);
    cookLogRepo = new CookLogRepository(db);
    tool = createGetRecipeTool(recipeRepo, cookLogRepo);
  });

  it("returns recipe with empty cook log for uncooked recipe", async () => {
    const recipe = await recipeRepo.create({
      title: "New Recipe",
      source: "manual",
      instructions: "Cook it",
      ingredients: [{ name: "salt", quantity: 1, unit: "tsp" }],
    });

    const respond = vi.fn();
    await tool.handler({ id: recipe.id }, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.ok).toBe(true);
    expect(result.recipe.title).toBe("New Recipe");
    expect(result.recipe.ingredients).toHaveLength(1);
    expect(result.recipe.cookLog).toEqual([]);
  });

  it("includes cook log history with parsed modifications", async () => {
    const recipe = await recipeRepo.create({
      title: "Gochujang Chicken",
      source: "manual",
      instructions: "Cook it",
    });

    await cookLogRepo.logCook({ recipeId: recipe.id });
    await cookLogRepo.logCook({
      recipeId: recipe.id,
      verdict: "banger",
      notes: "Amazing",
      modifications: [{ original: "1 tbsp gochujang", modification: "2 tbsp gochujang" }],
    });

    await cookLogRepo.logCook({
      recipeId: recipe.id,
      verdict: "make_again",
      notes: "Still good",
    });

    const respond = vi.fn();
    await tool.handler({ id: recipe.id }, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.recipe.cookLog).toHaveLength(3);
    // Most recent first
    expect(result.recipe.cookLog[0].verdict).toBe("make_again");
    expect(result.recipe.cookLog[1].verdict).toBe("banger");
    expect(result.recipe.cookLog[1].modifications).toEqual([
      { original: "1 tbsp gochujang", modification: "2 tbsp gochujang" },
    ]);
  });

  it("returns error for nonexistent recipe", async () => {
    const respond = vi.fn();
    await tool.handler({ id: "nonexistent" }, { respond });

    expect(respond).toHaveBeenCalledWith(false, expect.objectContaining({
      ok: false,
      error: "Recipe not found",
    }));
  });
});
