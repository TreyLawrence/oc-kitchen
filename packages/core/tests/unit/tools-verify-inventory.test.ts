import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { InventoryRepository } from "../../src/repositories/inventory.repo.js";
import { RecipeRepository } from "../../src/repositories/recipe.repo.js";
import { MealPlanRepository } from "../../src/repositories/meal-plan.repo.js";
import { createVerifyInventoryTool } from "../../src/tools/inventory-verify.js";

// Spec: specs/inventory/inventory-tracking.md — verify_inventory tool

describe("verify_inventory tool", () => {
  let repo: InventoryRepository;
  let recipeRepo: RecipeRepository;
  let mealPlanRepo: MealPlanRepository;
  let tool: ReturnType<typeof createVerifyInventoryTool>;

  beforeEach(() => {
    const { db } = createTestDb();
    repo = new InventoryRepository(db);
    recipeRepo = new RecipeRepository(db);
    mealPlanRepo = new MealPlanRepository(db);
    tool = createVerifyInventoryTool(repo, mealPlanRepo, recipeRepo);
  });

  it("has correct name", () => {
    expect(tool.name).toBe("verify_inventory");
  });

  it("returns allFresh when no items exist", async () => {
    const respond = vi.fn();
    await tool.handler({}, { respond });

    expect(respond).toHaveBeenCalledWith(true, expect.objectContaining({ ok: true }));
    const result = respond.mock.calls[0][1];
    expect(result.allFresh).toBe(true);
    expect(result.confident).toEqual([]);
    expect(result.needsCheck).toEqual([]);
    expect(result.question).toBe("");
  });

  it("returns allFresh when all items are recently updated", async () => {
    await repo.add([
      { name: "chicken thighs", category: "protein", quantity: 2, unit: "lbs", location: "fridge" },
      { name: "rice", category: "pantry", quantity: 5, unit: "lbs", location: "pantry" },
    ]);

    const respond = vi.fn();
    await tool.handler({}, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.allFresh).toBe(true);
    expect(result.confident).toHaveLength(2);
    expect(result.needsCheck).toHaveLength(0);
  });

  it("flags stale perishables after 5 days", async () => {
    // Add an item and manually backdate its updatedAt
    const items = await repo.add([
      { name: "chicken thighs", category: "protein", quantity: 2, unit: "lbs", location: "fridge" },
    ]);

    // Backdate the item by updating the DB directly
    const { db } = createTestDb();
    const repoWithOldData = new InventoryRepository(db);
    const oldItems = await repoWithOldData.add([
      { name: "old milk", category: "dairy", quantity: 1, unit: "gallon", location: "fridge" },
    ]);

    // Use getStaleItems with a future date to simulate staleness
    const stale = await repo.getStaleItems("2026-05-01");

    // The chicken added "today" (2026-04-23) would be 8 days old on 2026-05-01
    expect(stale.needsCheck.length).toBeGreaterThan(0);
    const chickenCheck = stale.needsCheck.find((i: any) => i.name === "chicken thighs");
    expect(chickenCheck).toBeTruthy();
    expect(chickenCheck.reason).toContain("perishable");
  });

  it("builds a question listing stale items", async () => {
    await repo.add([
      { name: "chicken thighs", category: "protein", quantity: 2, unit: "lbs", location: "fridge" },
      { name: "spinach", category: "produce", quantity: 1, unit: "bag", location: "fridge" },
    ]);

    // Patch getStaleItems to return stale items
    const originalGetStale = repo.getStaleItems.bind(repo);
    repo.getStaleItems = async () => {
      const result = await originalGetStale("2026-05-01");
      return result;
    };

    const respond = vi.fn();
    await tool.handler({}, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.allFresh).toBe(false);
    expect(result.question).toContain("chicken thighs");
    expect(result.question).toContain("fridge");
    expect(result.question).toContain("spinach");
  });

  it("keeps pantry items confident for 30 days", async () => {
    await repo.add([
      { name: "rice", category: "pantry", quantity: 5, unit: "lbs", location: "pantry" },
    ]);

    // 10 days later — pantry should still be confident
    const stale = await repo.getStaleItems("2026-05-03");
    expect(stale.confident).toHaveLength(1);
    expect(stale.needsCheck).toHaveLength(0);
  });

  it("flags pantry items after 30 days", async () => {
    await repo.add([
      { name: "rice", category: "pantry", quantity: 5, unit: "lbs", location: "pantry" },
    ]);

    // 35 days later — pantry should need check
    const stale = await repo.getStaleItems("2026-05-28");
    expect(stale.needsCheck).toHaveLength(1);
    expect(stale.needsCheck[0].name).toBe("rice");
  });

  it("filters to meal-plan-relevant items when mealPlanId is provided", async () => {
    // Add chicken and milk to inventory
    await repo.add([
      { name: "chicken thighs", category: "protein", quantity: 2, unit: "lbs", location: "fridge" },
      { name: "milk", category: "dairy", quantity: 1, unit: "gallon", location: "fridge" },
    ]);

    // Create a recipe that only uses chicken
    const recipe = await recipeRepo.create({
      title: "Simple Chicken",
      source: "manual",
      instructions: "Cook the chicken",
      ingredients: [{ name: "chicken thighs", quantity: 2, unit: "lbs" }],
    });

    // Create a meal plan with that recipe
    const plan = await mealPlanRepo.create({
      name: "Test Week",
      weekStart: "2026-04-20",
      weekEnd: "2026-04-26",
      entries: [{ dayOfWeek: 1, mealType: "dinner", recipeId: recipe.id }],
    });

    // Patch getStaleItems to simulate staleness
    const originalGetStale = repo.getStaleItems.bind(repo);
    repo.getStaleItems = async () => {
      return originalGetStale("2026-05-01");
    };

    const respond = vi.fn();
    await tool.handler({ mealPlanId: plan.id }, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.ok).toBe(true);
    // Only chicken should appear (relevant to meal plan), not milk
    const needsCheckNames = result.needsCheck.map((i: any) => i.name);
    expect(needsCheckNames).toContain("chicken thighs");
    expect(needsCheckNames).not.toContain("milk");
  });

  it("returns all stale items when no mealPlanId", async () => {
    // Add chicken and milk to inventory
    await repo.add([
      { name: "chicken thighs", category: "protein", quantity: 2, unit: "lbs", location: "fridge" },
      { name: "milk", category: "dairy", quantity: 1, unit: "gallon", location: "fridge" },
    ]);

    // Create a recipe that only uses chicken
    await recipeRepo.create({
      title: "Simple Chicken",
      source: "manual",
      instructions: "Cook the chicken",
      ingredients: [{ name: "chicken thighs", quantity: 2, unit: "lbs" }],
    });

    // Patch getStaleItems to simulate staleness
    const originalGetStale = repo.getStaleItems.bind(repo);
    repo.getStaleItems = async () => {
      return originalGetStale("2026-05-01");
    };

    const respond = vi.fn();
    await tool.handler({}, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.ok).toBe(true);
    // Both items should appear since no meal plan filter
    const needsCheckNames = result.needsCheck.map((i: any) => i.name);
    expect(needsCheckNames).toContain("chicken thighs");
    expect(needsCheckNames).toContain("milk");
  });
});
