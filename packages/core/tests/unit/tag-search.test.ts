import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { RecipeRepository } from "../../src/repositories/recipe.repo.js";

// Spec: specs/recipes/recipe-management.md — Tag search robustness
// Tags are now typed objects. Search must match against the "tag" field
// and not false-positive on substring matches.

describe("tag search robustness", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let repo: RecipeRepository;

  beforeEach(async () => {
    const testDb = createTestDb();
    db = testDb.db;
    repo = new RecipeRepository(db);

    await repo.create({
      title: "Quick Tacos",
      source: "manual",
      instructions: "Fast tacos",
      tags: [
        { tag: "quick", type: "duration" },
        { tag: "mexican", type: "cuisine" },
        { tag: "weeknight dinner", type: "user" },
      ],
    });
    await repo.create({
      title: "Quick Pickled Onions",
      source: "manual",
      instructions: "Pickle them",
      tags: [
        { tag: "quick-pickle", type: "user" },
        { tag: "quick", type: "duration" },
        { tag: "condiment", type: "user" },
      ],
    });
    await repo.create({
      title: "Smoked Brisket",
      source: "manual",
      instructions: "Low and slow on the BGE",
      tags: [
        { tag: "project", type: "duration" },
        { tag: "big green egg", type: "equipment" },
        { tag: "bbq", type: "user" },
        { tag: "american", type: "cuisine" },
        { tag: "summer", type: "seasonal" },
      ],
    });
  });

  it("finds recipes by exact tag name", async () => {
    const results = await repo.search({ tags: ["quick"] });
    expect(results.recipes).toHaveLength(2);
  });

  it("does not substring match tags", async () => {
    // Searching for "quick" should NOT match "quick-pickle" as a tag
    // but both recipes above have an actual "quick" tag, so let's test
    // that searching for "pickle" doesn't match the "quick" tag
    const results = await repo.search({ tags: ["pickle"] });
    expect(results.recipes).toHaveLength(0);
  });

  it("does not match partial tag names", async () => {
    // "quick-pickle" is a tag, but searching "quick-pick" should not match
    const results = await repo.search({ tags: ["quick-pick"] });
    expect(results.recipes).toHaveLength(0);
  });

  it("finds recipes by tag that only one recipe has", async () => {
    const results = await repo.search({ tags: ["bbq"] });
    expect(results.recipes).toHaveLength(1);
    expect(results.recipes[0].title).toBe("Smoked Brisket");
  });

  it("searches by multiple tags (AND logic)", async () => {
    const results = await repo.search({ tags: ["quick", "mexican"] });
    expect(results.recipes).toHaveLength(1);
    expect(results.recipes[0].title).toBe("Quick Tacos");
  });

  it("free-text query searches across tag names", async () => {
    const results = await repo.search({ query: "bbq" });
    expect(results.recipes).toHaveLength(1);
    expect(results.recipes[0].title).toBe("Smoked Brisket");
  });

  it("handles typed tag objects in storage and retrieval", async () => {
    const results = await repo.search({ tags: ["summer"] });
    expect(results.recipes).toHaveLength(1);
    expect(results.recipes[0].title).toBe("Smoked Brisket");
    const tags = JSON.parse(results.recipes[0].tags);
    expect(tags).toContainEqual({ tag: "summer", type: "seasonal" });
  });
});
