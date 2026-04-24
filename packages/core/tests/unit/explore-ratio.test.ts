import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { RecipeRepository } from "../../src/repositories/recipe.repo.js";
import { CookLogRepository } from "../../src/repositories/cook-log.repo.js";
import { UserProfileRepository } from "../../src/repositories/user-profile.repo.js";
import { ExploreRatioService } from "../../src/services/explore-ratio.service.js";

// Spec: specs/meal-planning/weekly-plan.md — Rule 5: Ratio auto-adaptation

describe("ExploreRatioService", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let recipeRepo: RecipeRepository;
  let cookLogRepo: CookLogRepository;
  let profileRepo: UserProfileRepository;
  let service: ExploreRatioService;

  beforeEach(async () => {
    const testDb = createTestDb();
    db = testDb.db;
    recipeRepo = new RecipeRepository(db);
    cookLogRepo = new CookLogRepository(db);
    profileRepo = new UserProfileRepository(db);
    service = new ExploreRatioService(cookLogRepo, profileRepo);
  });

  async function createRecipe(title: string) {
    return recipeRepo.create({
      title,
      source: "manual",
      instructions: "Cook it",
    });
  }

  async function logFirstCook(title: string, verdict: string) {
    const recipe = await createRecipe(title);
    await cookLogRepo.logCook({ recipeId: recipe.id });
    await cookLogRepo.logCook({ recipeId: recipe.id, verdict: verdict as any });
    return recipe;
  }

  describe("checkAdaptation", () => {
    it("does not adapt with fewer than 3 explore cooks", async () => {
      await logFirstCook("Recipe A", "banger");
      await logFirstCook("Recipe B", "banger");

      const result = await service.checkAdaptation();
      expect(result.adapted).toBe(false);
      expect(result.reason).toContain("Not enough");
    });

    it("increases ratio when positive rate >= 0.7", async () => {
      await profileRepo.setPreference("explore_ratio", 0.3);

      // 3 positive explore cooks out of 3 = 100% positive
      await logFirstCook("Recipe A", "banger");
      await logFirstCook("Recipe B", "make_again");
      await logFirstCook("Recipe C", "banger");

      const result = await service.checkAdaptation();
      expect(result.adapted).toBe(true);
      expect(result.newRatio).toBe(0.35);
      expect(result.oldRatio).toBe(0.3);
    });

    it("decreases ratio when positive rate <= 0.3", async () => {
      await profileRepo.setPreference("explore_ratio", 0.4);

      // 3 negative explore cooks out of 3 = 0% positive
      await logFirstCook("Recipe A", "dont_make_again");
      await logFirstCook("Recipe B", "dont_make_again");
      await logFirstCook("Recipe C", "dont_make_again");

      const result = await service.checkAdaptation();
      expect(result.adapted).toBe(true);
      expect(result.newRatio).toBe(0.35);
      expect(result.oldRatio).toBe(0.4);
    });

    it("does not adapt when sentiment is mixed", async () => {
      await profileRepo.setPreference("explore_ratio", 0.3);

      // 2 positive, 1 negative = 66% positive (between 0.3 and 0.7)
      await logFirstCook("Recipe A", "banger");
      await logFirstCook("Recipe B", "dont_make_again");
      await logFirstCook("Recipe C", "make_again");

      const result = await service.checkAdaptation();
      expect(result.adapted).toBe(false);
    });

    it("uses default ratio of 0.3 when no preference set", async () => {
      await logFirstCook("Recipe A", "banger");
      await logFirstCook("Recipe B", "banger");
      await logFirstCook("Recipe C", "banger");

      const result = await service.checkAdaptation();
      expect(result.adapted).toBe(true);
      expect(result.oldRatio).toBe(0.3);
      expect(result.newRatio).toBe(0.35);
    });

    it("clamps ratio at upper bound of 0.70", async () => {
      await profileRepo.setPreference("explore_ratio", 0.7);

      await logFirstCook("Recipe A", "banger");
      await logFirstCook("Recipe B", "banger");
      await logFirstCook("Recipe C", "banger");

      const result = await service.checkAdaptation();
      expect(result.adapted).toBe(false);
    });

    it("clamps ratio at lower bound of 0.10", async () => {
      await profileRepo.setPreference("explore_ratio", 0.1);

      await logFirstCook("Recipe A", "dont_make_again");
      await logFirstCook("Recipe B", "dont_make_again");
      await logFirstCook("Recipe C", "dont_make_again");

      const result = await service.checkAdaptation();
      expect(result.adapted).toBe(false);
    });

    it("ignores try_again_with_tweaks in sentiment calculation", async () => {
      await profileRepo.setPreference("explore_ratio", 0.3);

      // 1 positive, 0 negative, 4 neutral = only 1 scoreable, positive rate = 1.0
      // But need 3 scoreable... let's do 3 positive + 4 neutral
      await logFirstCook("Recipe A", "banger");
      await logFirstCook("Recipe B", "make_again");
      await logFirstCook("Recipe C", "banger");
      await logFirstCook("Recipe D", "try_again_with_tweaks");
      await logFirstCook("Recipe E", "try_again_with_tweaks");

      const result = await service.checkAdaptation();
      expect(result.adapted).toBe(true);
      expect(result.newRatio).toBe(0.35);
    });

    it("only counts first cook as explore — repeat cooks are exploit", async () => {
      await profileRepo.setPreference("explore_ratio", 0.4);

      // Create 3 recipes, cook each once (explore), then cook them again (exploit)
      const r1 = await createRecipe("Recipe A");
      const r2 = await createRecipe("Recipe B");
      const r3 = await createRecipe("Recipe C");

      // First cooks — verdict-free cook required before verdict
      await cookLogRepo.logCook({ recipeId: r1.id });
      await cookLogRepo.logCook({ recipeId: r2.id });
      await cookLogRepo.logCook({ recipeId: r3.id });

      // First verdict cooks — all bangers (explore)
      await cookLogRepo.logCook({ recipeId: r1.id, verdict: "banger" });
      await cookLogRepo.logCook({ recipeId: r2.id, verdict: "banger" });
      await cookLogRepo.logCook({ recipeId: r3.id, verdict: "banger" });

      // Second cooks — all dont_make_again (exploit, should be ignored)
      await cookLogRepo.logCook({ recipeId: r1.id, verdict: "dont_make_again" });
      await cookLogRepo.logCook({ recipeId: r2.id, verdict: "dont_make_again" });
      await cookLogRepo.logCook({ recipeId: r3.id, verdict: "dont_make_again" });

      const result = await service.checkAdaptation();
      // Only explore cooks (first cooks) count — all bangers → increase
      expect(result.adapted).toBe(true);
      expect(result.newRatio).toBe(0.45);
    });

    it("persists the new ratio to user preferences", async () => {
      await profileRepo.setPreference("explore_ratio", 0.3);

      await logFirstCook("Recipe A", "banger");
      await logFirstCook("Recipe B", "banger");
      await logFirstCook("Recipe C", "banger");

      await service.checkAdaptation();

      const stored = await profileRepo.getPreference("explore_ratio");
      expect(stored).toBe(0.35);
    });

    it("does not persist when no adaptation occurs", async () => {
      await profileRepo.setPreference("explore_ratio", 0.3);

      await logFirstCook("Recipe A", "banger");
      await logFirstCook("Recipe B", "dont_make_again");
      await logFirstCook("Recipe C", "make_again");

      await service.checkAdaptation();

      const stored = await profileRepo.getPreference("explore_ratio");
      expect(stored).toBe(0.3);
    });

    it("considers only the last 10 explore cooks", async () => {
      await profileRepo.setPreference("explore_ratio", 0.3);

      // Log 8 old negative explore cooks
      for (let i = 0; i < 8; i++) {
        await logFirstCook(`Old Bad Recipe ${i}`, "dont_make_again");
      }

      // Log 3 recent positive explore cooks (within last 10)
      // The last 10 explore cooks will be: 8 negative + 3 positive = 11, take last 10
      // That's 7 negative + 3 positive = 30% positive → no change?
      // Actually let's make it clearer: 12 old negative + 10 recent positive
      // Last 10 explore cooks = 10 positive → increase
      for (let i = 0; i < 10; i++) {
        await logFirstCook(`New Good Recipe ${i}`, "banger");
      }

      const result = await service.checkAdaptation();
      // Last 10 explore cooks are all bangers → increase
      expect(result.adapted).toBe(true);
      expect(result.newRatio).toBe(0.35);
    });
  });
});
