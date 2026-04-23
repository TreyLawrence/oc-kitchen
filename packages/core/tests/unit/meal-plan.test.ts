import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { RecipeRepository } from "../../src/repositories/recipe.repo.js";
import { MealPlanRepository } from "../../src/repositories/meal-plan.repo.js";

// Spec: specs/meal-planning/weekly-plan.md

describe("MealPlanRepository", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let mealPlanRepo: MealPlanRepository;
  let recipeRepo: RecipeRepository;
  let recipeId1: string;
  let recipeId2: string;

  beforeEach(async () => {
    const testDb = createTestDb();
    db = testDb.db;
    mealPlanRepo = new MealPlanRepository(db);
    recipeRepo = new RecipeRepository(db);

    const r1 = await recipeRepo.create({ title: "Gochujang Chicken", source: "imported", instructions: "Cook it" });
    const r2 = await recipeRepo.create({ title: "Mapo Tofu", source: "imported", instructions: "Wok it" });
    recipeId1 = r1.id;
    recipeId2 = r2.id;
  });

  describe("create", () => {
    it("creates a meal plan with entries", async () => {
      const plan = await mealPlanRepo.create({
        name: "Week of Apr 27",
        weekStart: "2026-04-27",
        weekEnd: "2026-05-03",
        entries: [
          { dayOfWeek: 0, mealType: "dinner", recipeId: recipeId1, category: "exploit" },
          { dayOfWeek: 1, mealType: "dinner", customTitle: "Leftover: Gochujang Chicken", category: "leftover" },
          { dayOfWeek: 2, mealType: "dinner", recipeId: recipeId2, category: "explore" },
        ],
      });

      expect(plan.id).toBeTruthy();
      expect(plan.name).toBe("Week of Apr 27");
      expect(plan.status).toBe("draft");
    });

    it("creates a plan with no entries", async () => {
      const plan = await mealPlanRepo.create({
        name: "Empty Week",
        weekStart: "2026-04-27",
        weekEnd: "2026-05-03",
        entries: [],
      });

      expect(plan.id).toBeTruthy();
    });

    // Spec: "Entry types — prep step with dependsOn"
    it("creates entries with prep dependencies", async () => {
      const plan = await mealPlanRepo.create({
        name: "Multi-day Week",
        weekStart: "2026-04-27",
        weekEnd: "2026-05-03",
        entries: [
          { dayOfWeek: 1, mealType: "dinner", recipeId: recipeId1, customTitle: "Prep: Chicken Stock", category: "prep" },
          { dayOfWeek: 2, mealType: "dinner", recipeId: recipeId2, category: "exploit", dependsOn: recipeId1 },
        ],
      });

      const fetched = await mealPlanRepo.getById(plan.id);
      const prepEntry = fetched!.entries.find((e: any) => e.category === "prep");
      const cookEntry = fetched!.entries.find((e: any) => e.dependsOn);
      expect(prepEntry).toBeDefined();
      expect(cookEntry!.dependsOn).toBe(recipeId1);
    });
  });

  describe("getById", () => {
    it("returns plan with entries and recipe details", async () => {
      const created = await mealPlanRepo.create({
        name: "Test Week",
        weekStart: "2026-04-27",
        weekEnd: "2026-05-03",
        entries: [
          { dayOfWeek: 0, mealType: "dinner", recipeId: recipeId1, category: "exploit" },
          { dayOfWeek: 3, mealType: "dinner", customTitle: "Takeout", category: "skip" },
        ],
      });

      const plan = await mealPlanRepo.getById(created.id);
      expect(plan).not.toBeNull();
      expect(plan!.entries).toHaveLength(2);

      const dinnerMon = plan!.entries.find((e: any) => e.dayOfWeek === 0);
      expect(dinnerMon!.recipeId).toBe(recipeId1);

      const skip = plan!.entries.find((e: any) => e.dayOfWeek === 3);
      expect(skip!.customTitle).toBe("Takeout");
      expect(skip!.category).toBe("skip");
    });

    it("returns null for nonexistent id", async () => {
      const plan = await mealPlanRepo.getById("nonexistent");
      expect(plan).toBeNull();
    });
  });

  describe("getCurrent", () => {
    it("returns the active plan for a given week", async () => {
      await mealPlanRepo.create({
        name: "Week of Apr 27",
        weekStart: "2026-04-27",
        weekEnd: "2026-05-03",
        status: "active",
        entries: [{ dayOfWeek: 0, mealType: "dinner", recipeId: recipeId1, category: "exploit" }],
      });

      const current = await mealPlanRepo.getCurrent("2026-04-29"); // Wednesday of that week
      expect(current).not.toBeNull();
      expect(current!.name).toBe("Week of Apr 27");
    });

    it("returns null when no active plan", async () => {
      const current = await mealPlanRepo.getCurrent("2026-04-29");
      expect(current).toBeNull();
    });
  });

  describe("update", () => {
    it("updates plan status", async () => {
      const created = await mealPlanRepo.create({
        name: "Draft Plan",
        weekStart: "2026-04-27",
        weekEnd: "2026-05-03",
        entries: [],
      });

      await mealPlanRepo.update(created.id, { status: "active" });

      const plan = await mealPlanRepo.getById(created.id);
      expect(plan!.status).toBe("active");
    });

    it("adds entries to an existing plan", async () => {
      const created = await mealPlanRepo.create({
        name: "Growing Plan",
        weekStart: "2026-04-27",
        weekEnd: "2026-05-03",
        entries: [{ dayOfWeek: 0, mealType: "dinner", recipeId: recipeId1, category: "exploit" }],
      });

      await mealPlanRepo.update(created.id, {
        addEntries: [{ dayOfWeek: 2, mealType: "dinner", recipeId: recipeId2, category: "explore" }],
      });

      const plan = await mealPlanRepo.getById(created.id);
      expect(plan!.entries).toHaveLength(2);
    });

    it("removes entries from a plan", async () => {
      const created = await mealPlanRepo.create({
        name: "Shrinking Plan",
        weekStart: "2026-04-27",
        weekEnd: "2026-05-03",
        entries: [
          { dayOfWeek: 0, mealType: "dinner", recipeId: recipeId1, category: "exploit" },
          { dayOfWeek: 2, mealType: "dinner", recipeId: recipeId2, category: "explore" },
        ],
      });

      const plan = await mealPlanRepo.getById(created.id);
      const entryToRemove = plan!.entries.find((e: any) => e.dayOfWeek === 0);

      await mealPlanRepo.update(created.id, { removeEntries: [entryToRemove!.id] });

      const updated = await mealPlanRepo.getById(created.id);
      expect(updated!.entries).toHaveLength(1);
      expect(updated!.entries[0].dayOfWeek).toBe(2);
    });

    // Spec: Rule 25 — "Only one active plan per week"
    it("lists plans ordered by week", async () => {
      await mealPlanRepo.create({ name: "Week 1", weekStart: "2026-04-20", weekEnd: "2026-04-26", entries: [] });
      await mealPlanRepo.create({ name: "Week 2", weekStart: "2026-04-27", weekEnd: "2026-05-03", entries: [] });

      const plans = await mealPlanRepo.list();
      expect(plans).toHaveLength(2);
      expect(plans[0].name).toBe("Week 2"); // newest first
    });
  });
});
