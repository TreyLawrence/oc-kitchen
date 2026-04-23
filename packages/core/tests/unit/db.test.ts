import { describe, it, expect } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { recipes, recipeIngredients, cookLog } from "../../src/db/schema.js";
import { eq } from "drizzle-orm";

describe("database", () => {
  it("creates tables and inserts a recipe", () => {
    const { db } = createTestDb();

    db.insert(recipes).values({
      id: "test-1",
      title: "Test Recipe",
      source: "manual",
      instructions: "Do the thing",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run();

    const result = db.select().from(recipes).where(eq(recipes.id, "test-1")).get();
    expect(result).toBeDefined();
    expect(result!.title).toBe("Test Recipe");
    expect(result!.source).toBe("manual");
  });

  it("cascades recipe_ingredients on recipe delete", () => {
    const { db } = createTestDb();

    db.insert(recipes).values({
      id: "r1",
      title: "Soup",
      source: "manual",
      instructions: "Make soup",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run();

    db.insert(recipeIngredients).values({
      id: "i1",
      recipeId: "r1",
      name: "onion",
      sortOrder: 0,
    }).run();

    db.delete(recipes).where(eq(recipes.id, "r1")).run();

    const ingredients = db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, "r1")).all();
    expect(ingredients).toHaveLength(0);
  });

  it("cascades cook_log on recipe delete", () => {
    const { db } = createTestDb();

    db.insert(recipes).values({
      id: "r2",
      title: "Tacos",
      source: "manual",
      instructions: "Make tacos",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run();

    db.insert(cookLog).values({
      id: "cl1",
      recipeId: "r2",
      verdict: "banger",
      cookedAt: new Date().toISOString(),
    }).run();

    db.delete(recipes).where(eq(recipes.id, "r2")).run();

    const logs = db.select().from(cookLog).where(eq(cookLog.recipeId, "r2")).all();
    expect(logs).toHaveLength(0);
  });
});
