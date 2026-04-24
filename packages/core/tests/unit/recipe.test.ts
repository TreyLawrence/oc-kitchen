import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../src/db/index.js";
import { RecipeRepository } from "../../src/repositories/recipe.repo.js";
import { mealPlans, mealPlanEntries } from "../../src/db/schema.js";

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
        tags: [
          { tag: "bbq", type: "user" },
          { tag: "big green egg", type: "equipment" },
        ],
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
        tags: [
          { tag: "korean", type: "cuisine" },
          { tag: "weeknight", type: "duration" },
        ],
        ingredients: [{ name: "chicken wings", quantity: 2, unit: "lbs", category: "protein" }],
      });
      await repo.create({
        title: "Smoked Brisket",
        source: "manual",
        instructions: "12 hours on the BGE",
        tags: [
          { tag: "bbq", type: "user" },
          { tag: "big green egg", type: "equipment" },
          { tag: "project", type: "duration" },
        ],
      });
      await repo.create({
        title: "Quick Stir Fry",
        source: "ai_generated",
        instructions: "Wok it up",
        tags: [
          { tag: "weeknight", type: "duration" },
          { tag: "quick", type: "duration" },
        ],
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

    it("filters by tag name", async () => {
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

  // Spec: Behavior Rule 9 — "Duplicate detection: warn when importing a URL that already exists"
  describe("findBySourceUrl", () => {
    it("finds a recipe by its source URL", async () => {
      await repo.create({
        title: "Gochujang Chicken",
        source: "imported",
        sourceUrl: "https://www.bonappetit.com/recipe/gochujang-chicken",
        instructions: "Roast it",
      });

      const found = await repo.findBySourceUrl("https://www.bonappetit.com/recipe/gochujang-chicken");
      expect(found).not.toBeNull();
      expect(found!.title).toBe("Gochujang Chicken");
    });

    it("matches URLs with trailing slash differences", async () => {
      await repo.create({
        title: "Mapo Tofu",
        source: "imported",
        sourceUrl: "https://thewoksoflife.com/mapo-tofu/",
        instructions: "Cook it",
      });

      const found = await repo.findBySourceUrl("https://thewoksoflife.com/mapo-tofu");
      expect(found).not.toBeNull();
      expect(found!.title).toBe("Mapo Tofu");
    });

    it("returns null when URL not found", async () => {
      const found = await repo.findBySourceUrl("https://example.com/not-here");
      expect(found).toBeNull();
    });

    it("returns null when no recipes have source URLs", async () => {
      await repo.create({
        title: "Manual Recipe",
        source: "manual",
        instructions: "Do it",
      });

      const found = await repo.findBySourceUrl("https://example.com/recipe");
      expect(found).toBeNull();
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

    // Spec: Behavior Rule 5 — tags stored as JSON array of typed objects
    it("updates tags", async () => {
      const created = await repo.create({
        title: "Test",
        source: "manual",
        instructions: "Test",
        tags: [{ tag: "old", type: "user" }],
      });

      await repo.update(created.id, {
        tags: [
          { tag: "new", type: "user" },
          { tag: "quick", type: "duration" },
        ],
      });

      const updated = await repo.getById(created.id);
      const tags = JSON.parse(updated!.tags!);
      expect(tags).toContainEqual({ tag: "new", type: "user" });
      expect(tags).toContainEqual({ tag: "quick", type: "duration" });
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

    // Spec: Behavior Rule 6 — sets recipeId to null, preserves customTitle as fallback
    it("nulls recipeId on meal plan entries and sets customTitle as fallback", async () => {
      const recipe = await repo.create({
        title: "Smoked Ribs",
        source: "manual",
        instructions: "Smoke low and slow",
        ingredients: [],
      });

      // Create a meal plan and entries referencing this recipe
      const ts = new Date().toISOString();
      db.insert(mealPlans)
        .values({
          id: "mp-1",
          name: "Week 1",
          weekStart: "2026-04-20",
          weekEnd: "2026-04-26",
          status: "active",
          createdAt: ts,
          updatedAt: ts,
        })
        .run();

      // Entry without customTitle — should get recipe title as fallback
      db.insert(mealPlanEntries)
        .values({
          id: "mpe-1",
          mealPlanId: "mp-1",
          recipeId: recipe.id,
          dayOfWeek: 0,
          mealType: "dinner",
          sortOrder: 0,
        })
        .run();

      // Entry with existing customTitle — should keep its customTitle
      db.insert(mealPlanEntries)
        .values({
          id: "mpe-2",
          mealPlanId: "mp-1",
          recipeId: recipe.id,
          dayOfWeek: 1,
          mealType: "dinner",
          customTitle: "Leftover Ribs",
          sortOrder: 0,
        })
        .run();

      await repo.delete(recipe.id);

      const entry1 = db
        .select()
        .from(mealPlanEntries)
        .where(eq(mealPlanEntries.id, "mpe-1"))
        .get()!;
      const entry2 = db
        .select()
        .from(mealPlanEntries)
        .where(eq(mealPlanEntries.id, "mpe-2"))
        .get()!;

      // recipeId should be null (via ON DELETE set null)
      expect(entry1.recipeId).toBeNull();
      expect(entry2.recipeId).toBeNull();

      // customTitle fallback: entry without customTitle gets recipe title
      expect(entry1.customTitle).toBe("Smoked Ribs");
      // entry with existing customTitle keeps it
      expect(entry2.customTitle).toBe("Leftover Ribs");
    });

    it("returns false for nonexistent id", async () => {
      const result = await repo.delete("nonexistent");
      expect(result).toBe(false);
    });
  });
});
