import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { RecipeRepository } from "../../src/repositories/recipe.repo.js";
import { CookLogRepository } from "../../src/repositories/cook-log.repo.js";
import { recipes } from "../../src/db/schema.js";
import { eq } from "drizzle-orm";

// Spec: specs/recipes/recipe-management.md — Rating & Feedback, log_cook tool

describe("CookLogRepository", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let recipeRepo: RecipeRepository;
  let cookLogRepo: CookLogRepository;
  let recipeId: string;

  beforeEach(async () => {
    const testDb = createTestDb();
    db = testDb.db;
    recipeRepo = new RecipeRepository(db);
    cookLogRepo = new CookLogRepository(db);

    const recipe = await recipeRepo.create({
      title: "Test Recipe",
      source: "manual",
      instructions: "Do stuff",
    });
    recipeId = recipe.id;
  });

  // Spec: "Verdict + free-text notes + structured modifications + photos"
  it("logs a cook with verdict, notes, modifications, and photos", async () => {
    const entry = await cookLogRepo.logCook({
      recipeId,
      verdict: "banger",
      notes: "Doubled the garlic, incredible",
      modifications: [
        { original: "4 cloves garlic", modification: "8 cloves garlic" },
      ],
      photos: ["/path/to/photo.jpg"],
    });

    expect(entry.id).toBeTruthy();
    expect(entry.verdict).toBe("banger");
    expect(entry.notes).toBe("Doubled the garlic, incredible");
    expect(JSON.parse(entry.modifications!)).toEqual([
      { original: "4 cloves garlic", modification: "8 cloves garlic" },
    ]);
    expect(JSON.parse(entry.photos!)).toEqual(["/path/to/photo.jpg"]);
  });

  // Spec: Behavior Rule 3 — "Recipe-level verdict is derived from the most recent cook log"
  it("updates recipe verdict to match most recent cook", async () => {
    await cookLogRepo.logCook({ recipeId, verdict: "make_again" });

    const recipe = db.select().from(recipes).where(eq(recipes.id, recipeId)).get();
    expect(recipe!.verdict).toBe("make_again");
  });

  it("verdict changes over time with new cooks", async () => {
    await cookLogRepo.logCook({ recipeId, verdict: "try_again_with_tweaks" });
    await cookLogRepo.logCook({ recipeId, verdict: "banger" });

    const recipe = db.select().from(recipes).where(eq(recipes.id, recipeId)).get();
    expect(recipe!.verdict).toBe("banger");
  });

  // Spec: Behavior Rule 2 — "Rating is a four-tier system"
  it("accepts all four verdict values", async () => {
    const verdicts = ["banger", "make_again", "try_again_with_tweaks", "dont_make_again"] as const;
    for (const verdict of verdicts) {
      const entry = await cookLogRepo.logCook({ recipeId, verdict });
      expect(entry.verdict).toBe(verdict);
    }
  });

  // Spec: "Cook log is append-only"
  it("creates multiple entries for the same recipe", async () => {
    await cookLogRepo.logCook({ recipeId, verdict: "make_again", notes: "First time" });
    await cookLogRepo.logCook({ recipeId, verdict: "banger", notes: "Even better" });

    const history = await cookLogRepo.getHistory(recipeId);
    expect(history).toHaveLength(2);
    expect(history[0].verdict).toBe("banger"); // most recent first
    expect(history[1].verdict).toBe("make_again");
  });

  it("logs a cook with minimal fields (just verdict)", async () => {
    const entry = await cookLogRepo.logCook({ recipeId, verdict: "make_again" });
    expect(entry.notes).toBeNull();
    expect(entry.modifications).toBeNull();
    expect(entry.photos).toBeNull();
  });

  it("returns empty history for uncooked recipe", async () => {
    const history = await cookLogRepo.getHistory(recipeId);
    expect(history).toHaveLength(0);
  });
});
