import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { RecipeRepository } from "../../src/repositories/recipe.repo.js";
import { CookLogRepository } from "../../src/repositories/cook-log.repo.js";
import { UserProfileRepository } from "../../src/repositories/user-profile.repo.js";
import { PreferenceSummaryService } from "../../src/services/preference-summary.service.js";

// Spec: specs/shared/onboarding.md — Rule 6: preference_summary regeneration triggers

describe("PreferenceSummaryService", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let recipeRepo: RecipeRepository;
  let cookLogRepo: CookLogRepository;
  let profileRepo: UserProfileRepository;
  let service: PreferenceSummaryService;

  beforeEach(async () => {
    const testDb = createTestDb();
    db = testDb.db;
    recipeRepo = new RecipeRepository(db);
    cookLogRepo = new CookLogRepository(db);
    profileRepo = new UserProfileRepository(db);
    service = new PreferenceSummaryService(cookLogRepo, profileRepo);
  });

  async function createRecipe(title: string, tags?: string[]) {
    return recipeRepo.create({
      title,
      source: "manual",
      instructions: "Cook it",
      tags,
    });
  }

  describe("checkTrigger", () => {
    // Spec: "After every 5th cook log entry"
    it("triggers on every 5th cook log", async () => {
      const recipe = await createRecipe("Test Recipe");

      // Log initial cook without verdict (required before any verdict)
      await cookLogRepo.logCook({ recipeId: recipe.id });

      // Log 4 cooks — no trigger on 4th
      for (let i = 0; i < 4; i++) {
        await cookLogRepo.logCook({ recipeId: recipe.id, verdict: "make_again" });
      }
      let result = await service.checkTrigger("make_again", []);
      expect(result.shouldRegenerate).toBe(false);

      // Log 5th cook — trigger
      await cookLogRepo.logCook({ recipeId: recipe.id, verdict: "make_again" });
      result = await service.checkTrigger("make_again", []);
      expect(result.shouldRegenerate).toBe(true);
      expect(result.reason).toContain("5");
    });

    it("triggers on 10th cook log too", async () => {
      const recipe = await createRecipe("Test Recipe");

      await cookLogRepo.logCook({ recipeId: recipe.id });
      for (let i = 0; i < 10; i++) {
        await cookLogRepo.logCook({ recipeId: recipe.id, verdict: "make_again" });
      }
      const result = await service.checkTrigger("make_again", []);
      expect(result.shouldRegenerate).toBe(true);
      expect(result.reason).toContain("10");
    });

    // Spec: "After a 'don't make again' verdict"
    it("triggers on dont_make_again verdict", async () => {
      const recipe = await createRecipe("Bad Recipe");
      await cookLogRepo.logCook({ recipeId: recipe.id });
      await cookLogRepo.logCook({ recipeId: recipe.id, verdict: "dont_make_again" });

      const result = await service.checkTrigger("dont_make_again", []);
      expect(result.shouldRegenerate).toBe(true);
      expect(result.reason).toContain("avoid");
    });

    // Spec: "After the first 'banger' verdict for a new cuisine"
    it("triggers on first banger for a new cuisine tag", async () => {
      const korean = await createRecipe("Bibimbap", ["korean"]);
      await cookLogRepo.logCook({ recipeId: korean.id });
      await cookLogRepo.logCook({ recipeId: korean.id, verdict: "banger" });

      const result = await service.checkTrigger("banger", ["korean"]);
      expect(result.shouldRegenerate).toBe(true);
      expect(result.reason).toContain("cuisine");
    });

    it("does not trigger on second banger for same cuisine", async () => {
      const r1 = await createRecipe("Bibimbap", ["korean"]);
      const r2 = await createRecipe("Bulgogi", ["korean"]);
      await cookLogRepo.logCook({ recipeId: r1.id });
      await cookLogRepo.logCook({ recipeId: r1.id, verdict: "banger" });
      await cookLogRepo.logCook({ recipeId: r2.id });
      await cookLogRepo.logCook({ recipeId: r2.id, verdict: "banger" });

      // 2 total cooks, not a multiple of 5, not dont_make_again,
      // and "korean" already has a banger
      const result = await service.checkTrigger("banger", ["korean"]);
      expect(result.shouldRegenerate).toBe(false);
    });

    it("triggers when a recipe has a new cuisine tag even if others overlap", async () => {
      const r1 = await createRecipe("Bibimbap", ["korean"]);
      await cookLogRepo.logCook({ recipeId: r1.id });
      await cookLogRepo.logCook({ recipeId: r1.id, verdict: "banger" });

      const r2 = await createRecipe("Korean-Mexican Tacos", ["korean", "mexican"]);
      await cookLogRepo.logCook({ recipeId: r2.id });
      await cookLogRepo.logCook({ recipeId: r2.id, verdict: "banger" });

      // "mexican" is new even though "korean" already has a banger
      const result = await service.checkTrigger("banger", ["korean", "mexican"]);
      expect(result.shouldRegenerate).toBe(true);
    });

    it("does not trigger for make_again on non-milestone count", async () => {
      const recipe = await createRecipe("OK Recipe");
      await cookLogRepo.logCook({ recipeId: recipe.id });
      await cookLogRepo.logCook({ recipeId: recipe.id, verdict: "make_again" });

      const result = await service.checkTrigger("make_again", []);
      expect(result.shouldRegenerate).toBe(false);
    });
  });

  describe("checkStaleness", () => {
    // Spec: "Before generating a weekly meal plan (ensure it's fresh)"
    it("triggers when no summary exists and there are cook logs", async () => {
      const recipe = await createRecipe("Test Recipe");
      await cookLogRepo.logCook({ recipeId: recipe.id });
      await cookLogRepo.logCook({ recipeId: recipe.id, verdict: "banger" });

      const result = await service.checkStaleness();
      expect(result.shouldRegenerate).toBe(true);
      expect(result.reason).toContain("No preference summary");
    });

    it("does not trigger when no summary and no cook logs", async () => {
      const result = await service.checkStaleness();
      expect(result.shouldRegenerate).toBe(false);
    });

    it("triggers when summary exists but cook logs are present (refresh)", async () => {
      await profileRepo.setPreference("preference_summary", "Loves Korean food");
      const recipe = await createRecipe("Test Recipe");
      await cookLogRepo.logCook({ recipeId: recipe.id });
      await cookLogRepo.logCook({ recipeId: recipe.id, verdict: "make_again" });

      const result = await service.checkStaleness();
      expect(result.shouldRegenerate).toBe(true);
      expect(result.reason).toContain("Refreshing");
    });
  });

  describe("gatherContext", () => {
    it("returns recent logs with recipe details", async () => {
      const recipe = await createRecipe("Gochujang Chicken", ["korean", "weeknight"]);
      await cookLogRepo.logCook({ recipeId: recipe.id });
      await cookLogRepo.logCook({
        recipeId: recipe.id,
        verdict: "banger",
        notes: "Doubled the garlic",
        modifications: [{ original: "4 cloves garlic", modification: "8 cloves garlic" }],
      });

      const context = await service.gatherContext();

      expect(context.recentLogs).toHaveLength(1);
      expect(context.recentLogs[0].recipeTitle).toBe("Gochujang Chicken");
      expect(context.recentLogs[0].verdict).toBe("banger");
      expect(context.recentLogs[0].notes).toBe("Doubled the garlic");
      expect(context.recentLogs[0].tags).toEqual(["korean", "weeknight"]);
    });

    it("includes verdict counts", async () => {
      const r1 = await createRecipe("Recipe A", ["korean"]);
      const r2 = await createRecipe("Recipe B", ["italian"]);
      const r3 = await createRecipe("Recipe C", ["mexican"]);

      await cookLogRepo.logCook({ recipeId: r1.id });
      await cookLogRepo.logCook({ recipeId: r1.id, verdict: "banger" });
      await cookLogRepo.logCook({ recipeId: r2.id });
      await cookLogRepo.logCook({ recipeId: r2.id, verdict: "make_again" });
      await cookLogRepo.logCook({ recipeId: r3.id });
      await cookLogRepo.logCook({ recipeId: r3.id, verdict: "banger" });

      const context = await service.gatherContext();
      expect(context.verdictCounts).toEqual({ banger: 2, make_again: 1 });
    });

    it("includes current summary if one exists", async () => {
      await profileRepo.setPreference("preference_summary", "Loves bold flavors");

      const context = await service.gatherContext();
      expect(context.currentSummary).toBe("Loves bold flavors");
    });

    it("returns null currentSummary when none exists", async () => {
      const context = await service.gatherContext();
      expect(context.currentSummary).toBeNull();
    });

    it("includes agent instructions", async () => {
      const context = await service.gatherContext();
      expect(context.instructions).toContain("Synthesize");
      expect(context.instructions).toContain("preference_summary");
    });

    it("handles recipes with no tags gracefully", async () => {
      const recipe = await createRecipe("Plain Recipe");
      await cookLogRepo.logCook({ recipeId: recipe.id });
      await cookLogRepo.logCook({ recipeId: recipe.id, verdict: "make_again" });

      const context = await service.gatherContext();
      expect(context.recentLogs[0].tags).toEqual([]);
    });
  });
});
