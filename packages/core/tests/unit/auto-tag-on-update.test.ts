import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { RecipeRepository } from "../../src/repositories/recipe.repo.js";
import { UserProfileRepository } from "../../src/repositories/user-profile.repo.js";
import { AutoTaggerService } from "../../src/services/auto-tagger.service.js";
import { createUpdateRecipeTool } from "../../src/tools/recipe-update.js";

// Spec: specs/recipes/recipe-management.md — Auto-tagging on update
// When prepMinutes, cookMinutes, or instructions change via update_recipe,
// auto-tags must be regenerated. User tags are preserved.

describe("auto-tagging on recipe update", () => {
  let recipeRepo: RecipeRepository;
  let profileRepo: UserProfileRepository;
  let autoTagger: AutoTaggerService;
  let tool: ReturnType<typeof createUpdateRecipeTool>;

  beforeEach(async () => {
    const { db } = createTestDb();
    recipeRepo = new RecipeRepository(db);
    profileRepo = new UserProfileRepository(db);
    autoTagger = new AutoTaggerService(profileRepo);
    tool = createUpdateRecipeTool(recipeRepo, autoTagger);
  });

  it("regenerates duration tags when prepMinutes changes", async () => {
    const recipe = await recipeRepo.create({
      title: "Fast Dish",
      source: "manual",
      instructions: "Cook it",
      prepMinutes: 5,
      cookMinutes: 10,
      tags: [
        { tag: "quick", type: "duration" },
        { tag: "date night", type: "user" },
      ],
    });

    const respond = vi.fn();
    await tool.handler({ id: recipe.id, prepMinutes: 90 }, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.ok).toBe(true);
    const tags = JSON.parse(result.recipe.tags);
    // 90 + 10 = 100 min → no duration tag (60-119 gap)
    expect(tags).not.toContainEqual({ tag: "quick", type: "duration" });
    expect(tags).toContainEqual({ tag: "date night", type: "user" });
  });

  it("regenerates duration tags when cookMinutes changes", async () => {
    const recipe = await recipeRepo.create({
      title: "Fast Dish",
      source: "manual",
      instructions: "Cook it",
      prepMinutes: 10,
      cookMinutes: 10,
      tags: [
        { tag: "quick", type: "duration" },
        { tag: "lunch", type: "user" },
      ],
    });

    const respond = vi.fn();
    await tool.handler({ id: recipe.id, cookMinutes: 480 }, { respond });

    const result = respond.mock.calls[0][1];
    const tags = JSON.parse(result.recipe.tags);
    // 10 + 480 = 490 min → project
    expect(tags).toContainEqual({ tag: "project", type: "duration" });
    expect(tags).not.toContainEqual({ tag: "quick", type: "duration" });
    expect(tags).toContainEqual({ tag: "lunch", type: "user" });
  });

  it("regenerates equipment tags when instructions change", async () => {
    await profileRepo.addEquipment([
      { name: "Big Green Egg", category: "grill" },
      { name: "Wok", category: "cookware" },
    ]);

    const recipe = await recipeRepo.create({
      title: "Grilled Chicken",
      source: "manual",
      instructions: "Fire up the Big Green Egg",
      prepMinutes: 20,
      cookMinutes: 40,
      tags: [
        { tag: "big green egg", type: "equipment" },
        { tag: "weeknight", type: "duration" },
      ],
    });

    const respond = vi.fn();
    await tool.handler(
      { id: recipe.id, instructions: "Heat the wok and stir fry" },
      { respond }
    );

    const result = respond.mock.calls[0][1];
    const tags = JSON.parse(result.recipe.tags);
    // Instructions no longer mention BGE, now mention wok
    expect(tags).toContainEqual({ tag: "wok", type: "equipment" });
    expect(tags).not.toContainEqual({ tag: "big green egg", type: "equipment" });
    // Duration unchanged (20 + 40 = 60 → no duration tag for 60-119)
  });

  it("does not re-run auto-tagger for non-triggering updates", async () => {
    const recipe = await recipeRepo.create({
      title: "Tacos",
      source: "manual",
      instructions: "Make tacos",
      prepMinutes: 10,
      cookMinutes: 15,
      tags: [
        { tag: "quick", type: "duration" },
        { tag: "dinner", type: "user" },
      ],
    });

    const respond = vi.fn();
    // Only updating title — should NOT trigger auto-tag regeneration
    await tool.handler({ id: recipe.id, title: "Better Tacos" }, { respond });

    const result = respond.mock.calls[0][1];
    const tags = JSON.parse(result.recipe.tags);
    // Tags should be unchanged
    expect(tags).toContainEqual({ tag: "quick", type: "duration" });
    expect(tags).toContainEqual({ tag: "dinner", type: "user" });
  });

  it("preserves user tags across multiple auto-tag regenerations", async () => {
    const recipe = await recipeRepo.create({
      title: "Dinner",
      source: "manual",
      instructions: "Cook it",
      prepMinutes: 10,
      cookMinutes: 10,
      tags: [
        { tag: "quick", type: "duration" },
        { tag: "family favorite", type: "user" },
        { tag: "kid-friendly", type: "user" },
      ],
    });

    const respond = vi.fn();
    // First update: change to weeknight timing
    await tool.handler({ id: recipe.id, cookMinutes: 35 }, { respond });
    let tags = JSON.parse(respond.mock.calls[0][1].recipe.tags);
    expect(tags).toContainEqual({ tag: "weeknight", type: "duration" });
    expect(tags).toContainEqual({ tag: "family favorite", type: "user" });
    expect(tags).toContainEqual({ tag: "kid-friendly", type: "user" });

    // Second update: change to project timing
    respond.mockClear();
    await tool.handler({ id: recipe.id, cookMinutes: 300 }, { respond });
    tags = JSON.parse(respond.mock.calls[0][1].recipe.tags);
    expect(tags).toContainEqual({ tag: "project", type: "duration" });
    expect(tags).not.toContainEqual({ tag: "weeknight", type: "duration" });
    expect(tags).toContainEqual({ tag: "family favorite", type: "user" });
    expect(tags).toContainEqual({ tag: "kid-friendly", type: "user" });
  });
});
