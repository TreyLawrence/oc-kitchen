import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { RecipeRepository } from "../../src/repositories/recipe.repo.js";

// Spec: specs/recipes/recipe-management.md

describe("RecipeRepository", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let repo: RecipeRepository;

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    repo = new RecipeRepository(db);
  });

  describe("create", () => {
    // Spec: Behavior Rule 1 — "Title is required. Instructions are required."
    it("creates a recipe with title, instructions, and ingredients", async () => {
      const recipe = await repo.create({
        title: "Smoked Pork Shoulder",
        source: "manual",
        instructions: "Low and slow on the BGE",
        description: "8 hour cook",
        servings: 8,
        prepMinutes: 30,
        cookMinutes: 480,
        ingredients: [
          { name: "pork shoulder", quantity: 8, unit: "lbs", category: "protein" },
          { name: "yellow mustard", quantity: 0.5, unit: "cup", category: "pantry" },
        ],
        tags: ["bbq", "big green egg"],
      });

      expect(recipe.id).toBeTruthy();
      expect(recipe.title).toBe("Smoked Pork Shoulder");
      expect(recipe.source).toBe("manual");
      expect(recipe.verdict).toBeNull();
      expect(recipe.isFavorite).toBe(false);
    });

    // Spec: Behavior Rule 4 — "Source is immutable"
    it("stores source correctly", async () => {
      const recipe = await repo.create({
        title: "AI Recipe",
        source: "ai_generated",
        instructions: "Steps here",
      });
      expect(recipe.source).toBe("ai_generated");
    });

    it("creates a recipe with minimal fields", async () => {
      const recipe = await repo.create({
        title: "Quick Eggs",
        source: "manual",
        instructions: "Scramble them",
      });
      expect(recipe.id).toBeTruthy();
      expect(recipe.servings).toBeNull();
      expect(recipe.tags).toBeNull();
    });
  });

  describe("getById", () => {
    it("returns recipe with ingredients", async () => {
      const created = await repo.create({
        title: "Tacos",
        source: "manual",
        instructions: "Make tacos",
        ingredients: [
          { name: "tortillas", quantity: 8, unit: "count", category: "pantry" },
          { name: "ground beef", quantity: 1, unit: "lb", category: "protein" },
        ],
      });

      const recipe = await repo.getById(created.id);
      expect(recipe).toBeDefined();
      expect(recipe!.title).toBe("Tacos");
      expect(recipe!.ingredients).toHaveLength(2);
      expect(recipe!.ingredients[0].name).toBe("tortillas");
    });

    it("returns null for nonexistent id", async () => {
      const recipe = await repo.getById("nonexistent");
      expect(recipe).toBeNull();
    });
  });

  describe("search", () => {
    beforeEach(async () => {
      await repo.create({
        title: "Korean Fried Chicken",
        source: "imported",
        instructions: "Double fry",
        tags: ["korean", "weeknight"],
        ingredients: [{ name: "chicken wings", quantity: 2, unit: "lbs", category: "protein" }],
      });
      await repo.create({
        title: "Smoked Brisket",
        source: "manual",
        instructions: "12 hours on the BGE",
        tags: ["bbq", "big green egg", "project"],
      });
      await repo.create({
        title: "Quick Stir Fry",
        source: "ai_generated",
        instructions: "Wok it up",
        tags: ["weeknight", "quick"],
      });
    });

    // Spec: search_recipes — "free-text search across title, ingredients, tags"
    it("searches by title", async () => {
      const results = await repo.search({ query: "chicken" });
      expect(results.recipes).toHaveLength(1);
      expect(results.recipes[0].title).toBe("Korean Fried Chicken");
    });

    it("filters by source", async () => {
      const results = await repo.search({ source: "manual" });
      expect(results.recipes).toHaveLength(1);
      expect(results.recipes[0].title).toBe("Smoked Brisket");
    });

    it("filters by tag", async () => {
      const results = await repo.search({ tags: ["weeknight"] });
      expect(results.recipes).toHaveLength(2);
    });

    // Spec: "Searching with no filters → returns all recipes, newest first, limited to 20"
    it("returns all recipes when no filters", async () => {
      const results = await repo.search({});
      expect(results.recipes).toHaveLength(3);
      expect(results.total).toBe(3);
    });

    it("respects limit", async () => {
      const results = await repo.search({ limit: 1 });
      expect(results.recipes).toHaveLength(1);
      expect(results.total).toBe(3);
    });
  });

  describe("update", () => {
    it("updates recipe fields", async () => {
      const created = await repo.create({
        title: "Original",
        source: "manual",
        instructions: "Do stuff",
      });

      await repo.update(created.id, {
        title: "Updated Title",
        isFavorite: true,
      });

      const updated = await repo.getById(created.id);
      expect(updated!.title).toBe("Updated Title");
      expect(updated!.isFavorite).toBe(true);
      expect(updated!.instructions).toBe("Do stuff"); // unchanged
    });

    // Spec: Behavior Rule 5 — tags stored as JSON array
    it("updates tags", async () => {
      const created = await repo.create({
        title: "Test",
        source: "manual",
        instructions: "Test",
        tags: ["old"],
      });

      await repo.update(created.id, { tags: ["new", "tags"] });

      const updated = await repo.getById(created.id);
      expect(JSON.parse(updated!.tags!)).toEqual(["new", "tags"]);
    });
  });

  describe("delete", () => {
    // Spec: Behavior Rule 6 — "Deleting a recipe does not cascade to meal plan entries"
    it("deletes a recipe and cascades ingredients", async () => {
      const created = await repo.create({
        title: "Gone",
        source: "manual",
        instructions: "Bye",
        ingredients: [{ name: "stuff", quantity: 1, unit: "cup", category: "pantry" }],
      });

      await repo.delete(created.id);

      const recipe = await repo.getById(created.id);
      expect(recipe).toBeNull();
    });

    it("returns false for nonexistent id", async () => {
      const result = await repo.delete("nonexistent");
      expect(result).toBe(false);
    });
  });
});
