import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { UserProfileRepository } from "../../src/repositories/user-profile.repo.js";
import { RecipeRepository } from "../../src/repositories/recipe.repo.js";
import { createGenerateRecipeTool, createSaveGeneratedRecipeTool } from "../../src/tools/recipe-generate.js";

// Spec: specs/recipes/recipe-management.md — generate_recipe tool
// Design: Agent IS Claude — no separate API call needed

describe("generate_recipe tool", () => {
  let profileRepo: UserProfileRepository;
  let tool: ReturnType<typeof createGenerateRecipeTool>;

  beforeEach(async () => {
    const { db } = createTestDb();
    profileRepo = new UserProfileRepository(db);
    tool = createGenerateRecipeTool(profileRepo);
  });

  it("returns user context and generation instructions", async () => {
    await profileRepo.addEquipment([
      { name: "Big Green Egg", category: "grill" },
      { name: "Wok", category: "cookware" },
    ]);
    await profileRepo.setPreference("cuisine_affinities", ["korean", "mexican"]);
    await profileRepo.setPreference("dietary_constraints", ["no shellfish"]);
    await profileRepo.setPreference("adventurousness", "adventurous");

    const respond = vi.fn();
    await tool.handler(
      { prompt: "a smoky chicken dish", maxMinutes: 60, equipment: ["Big Green Egg"] },
      { respond }
    );

    expect(respond).toHaveBeenCalledWith(true, expect.objectContaining({ ok: true }));
    const result = respond.mock.calls[0][1];
    expect(result.action).toBe("generate_and_save");
    expect(result.prompt).toBe("a smoky chicken dish");
    expect(result.userContext.equipment).toContain("Big Green Egg");
    expect(result.userContext.cuisineAffinities).toEqual(["korean", "mexican"]);
    expect(result.userContext.dietaryConstraints).toEqual(["no shellfish"]);
    expect(result.userContext.maxMinutes).toBe(60);
    expect(result.userContext.mustUse).toEqual(["Big Green Egg"]);
    expect(result.instructions).toContain("save_generated_recipe");
  });

  it("works with empty profile", async () => {
    const respond = vi.fn();
    await tool.handler({ prompt: "surprise me" }, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.ok).toBe(true);
    expect(result.userContext).toEqual({});
  });
});

describe("save_generated_recipe tool", () => {
  let recipeRepo: RecipeRepository;
  let tool: ReturnType<typeof createSaveGeneratedRecipeTool>;

  beforeEach(() => {
    const { db } = createTestDb();
    recipeRepo = new RecipeRepository(db);
    tool = createSaveGeneratedRecipeTool(recipeRepo);
  });

  it("saves a generated recipe with source ai_generated", async () => {
    const respond = vi.fn();
    await tool.handler(
      {
        title: "Smoky BGE Chicken",
        description: "Charcoal-grilled chicken with gochujang glaze",
        servings: 4,
        prepMinutes: 20,
        cookMinutes: 45,
        instructions: "## Steps\n1. Light the BGE\n2. Grill the chicken",
        ingredients: [
          { name: "chicken thighs", quantity: 2, unit: "lbs", category: "protein" },
          { name: "gochujang", quantity: 3, unit: "tbsp", category: "pantry" },
        ],
        tags: ["bbq", "korean", "big green egg"],
      },
      { respond }
    );

    expect(respond).toHaveBeenCalledWith(true, expect.objectContaining({ ok: true }));
    const result = respond.mock.calls[0][1];
    expect(result.recipe.title).toBe("Smoky BGE Chicken");
    expect(result.recipe.source).toBe("ai_generated");
  });
});
