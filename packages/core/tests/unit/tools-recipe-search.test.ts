import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { RecipeRepository } from "../../src/repositories/recipe.repo.js";
import { CookLogRepository } from "../../src/repositories/cook-log.repo.js";
import { createSearchRecipesTool } from "../../src/tools/recipe-search.js";

// Spec: specs/recipes/recipe-management.md — search_recipes verdict filter

describe("search_recipes tool", () => {
  let recipeRepo: RecipeRepository;
  let cookLogRepo: CookLogRepository;
  let tool: ReturnType<typeof createSearchRecipesTool>;

  beforeEach(() => {
    const { db } = createTestDb();
    recipeRepo = new RecipeRepository(db);
    cookLogRepo = new CookLogRepository(db);
    tool = createSearchRecipesTool(recipeRepo);
  });

  it("filters by dont_make_again verdict", async () => {
    const good = await recipeRepo.create({
      title: "Good Recipe",
      source: "manual",
      instructions: "Cook it",
    });
    await cookLogRepo.logCook({ recipeId: good.id });
    await cookLogRepo.logCook({ recipeId: good.id, verdict: "banger" });

    const bad = await recipeRepo.create({
      title: "Bad Recipe",
      source: "manual",
      instructions: "Don't cook it",
    });
    await cookLogRepo.logCook({ recipeId: bad.id });
    await cookLogRepo.logCook({ recipeId: bad.id, verdict: "dont_make_again" });

    const respond = vi.fn();
    await tool.handler({ verdict: "dont_make_again" }, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.ok).toBe(true);
    expect(result.recipes).toHaveLength(1);
    expect(result.recipes[0].title).toBe("Bad Recipe");
  });

  it("includes dont_make_again in verdict enum", () => {
    const verdictProp = tool.parameters.properties.verdict;
    expect(verdictProp.enum).toContain("dont_make_again");
    expect(verdictProp.enum).toHaveLength(4);
  });
});
