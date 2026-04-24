import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { RecipeRepository } from "../../src/repositories/recipe.repo.js";
import { UserProfileRepository } from "../../src/repositories/user-profile.repo.js";
import { AutoTaggerService } from "../../src/services/auto-tagger.service.js";
import { createAutoTagRecipeTool } from "../../src/tools/auto-tag-recipe.js";

// Spec: specs/recipes/recipe-management.md — auto_tag_recipe tool
// Agent-side tool: gathers recipe context and returns instructions
// for the agent to classify cuisine and season.

describe("auto_tag_recipe tool", () => {
  let recipeRepo: RecipeRepository;
  let profileRepo: UserProfileRepository;
  let autoTagger: AutoTaggerService;
  let tool: ReturnType<typeof createAutoTagRecipeTool>;

  beforeEach(async () => {
    const { db } = createTestDb();
    recipeRepo = new RecipeRepository(db);
    profileRepo = new UserProfileRepository(db);
    autoTagger = new AutoTaggerService(profileRepo);
    tool = createAutoTagRecipeTool(recipeRepo, profileRepo, autoTagger);
  });

  it("returns recipe context for agent classification", async () => {
    const recipe = await recipeRepo.create({
      title: "Gochujang Chicken",
      source: "imported",
      instructions: "Marinate chicken in gochujang, roast at 425°F",
      prepMinutes: 15,
      cookMinutes: 45,
      ingredients: [
        { name: "chicken thighs", quantity: 2, unit: "lbs", category: "protein" },
        { name: "gochujang", quantity: 3, unit: "tbsp", category: "pantry" },
      ],
    });

    const respond = vi.fn();
    await tool.handler({ recipeId: recipe.id }, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.ok).toBe(true);
    expect(result.recipe.title).toBe("Gochujang Chicken");
    expect(result.recipe.instructions).toContain("gochujang");
    expect(result.recipe.ingredients).toBeDefined();
    expect(result.recipe.prepMinutes).toBe(15);
    expect(result.recipe.cookMinutes).toBe(45);
  });

  it("includes auto-generated duration and equipment tags", async () => {
    await profileRepo.addEquipment([
      { name: "Big Green Egg", category: "grill" },
    ]);

    const recipe = await recipeRepo.create({
      title: "BGE Smoked Ribs",
      source: "manual",
      instructions: "Smoke on the Big Green Egg for 5 hours",
      prepMinutes: 30,
      cookMinutes: 300,
    });

    const respond = vi.fn();
    await tool.handler({ recipeId: recipe.id }, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.autoTags).toContainEqual({ tag: "project", type: "duration" });
    expect(result.autoTags).toContainEqual({ tag: "big green egg", type: "equipment" });
  });

  it("includes existing user tags for preservation", async () => {
    const recipe = await recipeRepo.create({
      title: "Tacos",
      source: "manual",
      instructions: "Make tacos",
      prepMinutes: 20,
      cookMinutes: 15,
      tags: [
        { tag: "date night", type: "user" },
        { tag: "quick", type: "duration" },
      ],
    });

    const respond = vi.fn();
    await tool.handler({ recipeId: recipe.id }, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.existingUserTags).toContainEqual({ tag: "date night", type: "user" });
  });

  it("includes cuisine vocabulary in instructions", async () => {
    const recipe = await recipeRepo.create({
      title: "Pad Thai",
      source: "imported",
      instructions: "Stir fry noodles with tamarind sauce",
      prepMinutes: 20,
      cookMinutes: 10,
    });

    const respond = vi.fn();
    await tool.handler({ recipeId: recipe.id }, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.instructions).toContain("cuisine");
    expect(result.cuisineVocabulary).toBeDefined();
    expect(result.cuisineVocabulary).toContain("thai");
    expect(result.cuisineVocabulary).toContain("korean");
  });

  it("includes seasonal vocabulary in instructions", async () => {
    const recipe = await recipeRepo.create({
      title: "Beef Stew",
      source: "manual",
      instructions: "Braise beef with root vegetables",
      prepMinutes: 30,
      cookMinutes: 180,
    });

    const respond = vi.fn();
    await tool.handler({ recipeId: recipe.id }, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.instructions).toContain("season");
    expect(result.seasonalVocabulary).toBeDefined();
    expect(result.seasonalVocabulary).toContain("winter");
    expect(result.seasonalVocabulary).toContain("summer");
  });

  it("errors for nonexistent recipe", async () => {
    const respond = vi.fn();
    await tool.handler({ recipeId: "nonexistent" }, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("has correct parameter schema", () => {
    expect(tool.name).toBe("auto_tag_recipe");
    expect(tool.parameters.required).toContain("recipeId");
  });
});
