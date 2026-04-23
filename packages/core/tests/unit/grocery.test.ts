import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { RecipeRepository } from "../../src/repositories/recipe.repo.js";
import { MealPlanRepository } from "../../src/repositories/meal-plan.repo.js";
import { InventoryRepository } from "../../src/repositories/inventory.repo.js";
import { GroceryRepository } from "../../src/repositories/grocery.repo.js";
import { UserProfileRepository } from "../../src/repositories/user-profile.repo.js";
import { GroceryGenerationService } from "../../src/services/grocery-generation.service.js";

// Spec: specs/grocery/grocery-list.md

describe("GroceryRepository", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let groceryRepo: GroceryRepository;

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    groceryRepo = new GroceryRepository(db);
  });

  it("creates a grocery list with items", async () => {
    const list = await groceryRepo.create({
      name: "Week of Apr 27",
      items: [
        { name: "chicken thighs", quantity: 4, unit: "lbs", category: "protein", store: "wegmans" },
        { name: "gochujang", quantity: 3, unit: "tbsp", category: "pantry", store: "weee" },
      ],
    });

    expect(list.id).toBeTruthy();
    expect(list.status).toBe("draft");
  });

  it("gets a list with all items", async () => {
    const created = await groceryRepo.create({
      name: "Test List",
      items: [
        { name: "onions", quantity: 3, unit: "count", store: "wegmans" },
        { name: "soy sauce", quantity: 1, unit: "bottle", store: "wegmans" },
      ],
    });

    const list = await groceryRepo.getById(created.id);
    expect(list).not.toBeNull();
    expect(list!.items).toHaveLength(2);
  });

  it("updates list status", async () => {
    const created = await groceryRepo.create({ name: "Draft", items: [] });
    await groceryRepo.update(created.id, { status: "finalized" });

    const list = await groceryRepo.getById(created.id);
    expect(list!.status).toBe("finalized");
  });

  it("adds and removes items", async () => {
    const created = await groceryRepo.create({
      name: "Evolving List",
      items: [{ name: "original item", quantity: 1, unit: "count", store: "wegmans" }],
    });

    const list = await groceryRepo.getById(created.id);
    await groceryRepo.update(created.id, {
      addItems: [{ name: "new item", quantity: 2, unit: "count", store: "weee" }],
      removeItems: [list!.items[0].id],
    });

    const updated = await groceryRepo.getById(created.id);
    expect(updated!.items).toHaveLength(1);
    expect(updated!.items[0].name).toBe("new item");
  });

  it("checks off items", async () => {
    const created = await groceryRepo.create({
      name: "Checklist",
      items: [{ name: "milk", quantity: 1, unit: "gallon", store: "wegmans" }],
    });

    const list = await groceryRepo.getById(created.id);
    await groceryRepo.update(created.id, {
      updateItems: [{ id: list!.items[0].id, isChecked: true }],
    });

    const updated = await groceryRepo.getById(created.id);
    expect(updated!.items[0].isChecked).toBe(true);
  });
});

describe("GroceryGenerationService", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let recipeRepo: RecipeRepository;
  let mealPlanRepo: MealPlanRepository;
  let inventoryRepo: InventoryRepository;
  let groceryRepo: GroceryRepository;
  let profileRepo: UserProfileRepository;
  let service: GroceryGenerationService;

  beforeEach(async () => {
    const testDb = createTestDb();
    db = testDb.db;
    recipeRepo = new RecipeRepository(db);
    mealPlanRepo = new MealPlanRepository(db);
    inventoryRepo = new InventoryRepository(db);
    groceryRepo = new GroceryRepository(db);
    profileRepo = new UserProfileRepository(db);
    service = new GroceryGenerationService(recipeRepo, mealPlanRepo, inventoryRepo, groceryRepo, profileRepo);
  });

  // Spec: "Collect all recipe_ingredients from every recipe in the plan"
  it("generates a grocery list from a meal plan", async () => {
    const r1 = await recipeRepo.create({
      title: "Gochujang Chicken",
      source: "imported",
      instructions: "Cook",
      ingredients: [
        { name: "chicken thighs", quantity: 2, unit: "lbs", category: "protein" },
        { name: "gochujang", quantity: 3, unit: "tbsp", category: "pantry" },
      ],
    });

    const plan = await mealPlanRepo.create({
      name: "Test Week",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [{ dayOfWeek: 0, mealType: "dinner", recipeId: r1.id, category: "exploit" }],
    });

    const result = await service.generateFromPlan(plan.id);
    expect(result.list.items.length).toBeGreaterThanOrEqual(2);
    expect(result.list.items.some((i: any) => i.name === "chicken thighs")).toBe(true);
  });

  // Spec: "Subtract matching inventory_items"
  it("subtracts inventory from the list", async () => {
    await inventoryRepo.add([
      { name: "chicken thighs", category: "protein", quantity: 2, unit: "lbs", location: "fridge" },
    ]);

    const r1 = await recipeRepo.create({
      title: "Chicken Dish",
      source: "manual",
      instructions: "Cook",
      ingredients: [
        { name: "chicken thighs", quantity: 2, unit: "lbs", category: "protein" },
        { name: "onion", quantity: 1, unit: "count", category: "produce" },
      ],
    });

    const plan = await mealPlanRepo.create({
      name: "Test",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [{ dayOfWeek: 0, mealType: "dinner", recipeId: r1.id, category: "exploit" }],
    });

    const result = await service.generateFromPlan(plan.id);

    // Chicken should be subtracted (we have enough), onion should remain
    const chicken = result.list.items.find((i: any) => i.name === "chicken thighs");
    const onion = result.list.items.find((i: any) => i.name === "onion");
    expect(chicken).toBeUndefined(); // fully covered by inventory
    expect(onion).toBeDefined();
    expect(result.subtracted.some((s: any) => s.name === "chicken thighs")).toBe(true);
  });

  // Spec: "Aggregate duplicates"
  it("aggregates duplicate ingredients across recipes", async () => {
    const r1 = await recipeRepo.create({
      title: "Recipe 1", source: "manual", instructions: "Cook",
      ingredients: [{ name: "onion", quantity: 2, unit: "count", category: "produce" }],
    });
    const r2 = await recipeRepo.create({
      title: "Recipe 2", source: "manual", instructions: "Cook",
      ingredients: [{ name: "onion", quantity: 1, unit: "count", category: "produce" }],
    });

    const plan = await mealPlanRepo.create({
      name: "Test",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [
        { dayOfWeek: 0, mealType: "dinner", recipeId: r1.id, category: "exploit" },
        { dayOfWeek: 2, mealType: "dinner", recipeId: r2.id, category: "explore" },
      ],
    });

    const result = await service.generateFromPlan(plan.id);
    const onions = result.list.items.filter((i: any) => i.name === "onion");
    expect(onions).toHaveLength(1);
    expect(onions[0].quantity).toBe(3); // 2 + 1
  });

  // Spec: "Don't generate grocery items for leftover meals"
  it("skips leftover entries when generating", async () => {
    const r1 = await recipeRepo.create({
      title: "Chicken", source: "manual", instructions: "Cook",
      ingredients: [{ name: "chicken", quantity: 1, unit: "lb", category: "protein" }],
    });

    const plan = await mealPlanRepo.create({
      name: "Test",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [
        { dayOfWeek: 0, mealType: "dinner", recipeId: r1.id, category: "exploit" },
        { dayOfWeek: 1, mealType: "dinner", customTitle: "Leftover: Chicken", category: "leftover" },
        { dayOfWeek: 2, mealType: "dinner", customTitle: "Takeout", category: "skip" },
      ],
    });

    const result = await service.generateFromPlan(plan.id);
    // Should only have ingredients from the one recipe, not from leftovers/skip
    expect(result.list.items).toHaveLength(1);
  });

  it("assigns proteins to butcherbox when user has subscription", async () => {
    await profileRepo.setPreference("butcherbox_subscription", true);

    const r1 = await recipeRepo.create({
      title: "Seared Ribeye",
      source: "manual",
      instructions: "Cook",
      ingredients: [
        { name: "ribeye", quantity: 1, unit: "lb", category: "protein" },
        { name: "asparagus", quantity: 1, unit: "bunch", category: "produce" },
      ],
    });

    const plan = await mealPlanRepo.create({
      name: "Test",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [{ dayOfWeek: 0, mealType: "dinner", recipeId: r1.id, category: "exploit" }],
    });

    const result = await service.generateFromPlan(plan.id);
    const ribeye = result.list.items.find((i: any) => i.name === "ribeye");
    const asparagus = result.list.items.find((i: any) => i.name === "asparagus");
    expect(ribeye!.store).toBe("butcherbox");
    expect(asparagus!.store).toBe("wegmans");
  });

  it("assigns proteins to wegmans when no butcherbox subscription", async () => {
    const r1 = await recipeRepo.create({
      title: "Chicken Dinner",
      source: "manual",
      instructions: "Cook",
      ingredients: [
        { name: "chicken thighs", quantity: 2, unit: "lbs", category: "protein" },
      ],
    });

    const plan = await mealPlanRepo.create({
      name: "Test",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [{ dayOfWeek: 0, mealType: "dinner", recipeId: r1.id, category: "exploit" }],
    });

    const result = await service.generateFromPlan(plan.id);
    const chicken = result.list.items.find((i: any) => i.name === "chicken thighs");
    expect(chicken!.store).toBe("wegmans");
  });

  it("only routes known proteins to butcherbox, not all protein category items", async () => {
    await profileRepo.setPreference("butcherbox_subscription", true);

    const r1 = await recipeRepo.create({
      title: "Surf and Turf",
      source: "manual",
      instructions: "Cook",
      ingredients: [
        { name: "shrimp", quantity: 1, unit: "lb", category: "protein" },
        { name: "salmon", quantity: 1, unit: "lb", category: "protein" },
      ],
    });

    const plan = await mealPlanRepo.create({
      name: "Test",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [{ dayOfWeek: 0, mealType: "dinner", recipeId: r1.id, category: "exploit" }],
    });

    const result = await service.generateFromPlan(plan.id);
    const shrimp = result.list.items.find((i: any) => i.name === "shrimp");
    const salmon = result.list.items.find((i: any) => i.name === "salmon");
    expect(shrimp!.store).toBe("wegmans");
    expect(salmon!.store).toBe("butcherbox");
  });

  it("warns when weee order has few items", async () => {
    const r1 = await recipeRepo.create({
      title: "Mapo Tofu",
      source: "manual",
      instructions: "Cook",
      ingredients: [
        { name: "doubanjiang", quantity: 2, unit: "tbsp", category: "pantry" },
        { name: "ground pork", quantity: 1, unit: "lb", category: "protein" },
      ],
    });

    const plan = await mealPlanRepo.create({
      name: "Test",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [{ dayOfWeek: 0, mealType: "dinner", recipeId: r1.id, category: "exploit" }],
    });

    const result = await service.generateFromPlan(plan.id);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w: string) => w.includes("Weee!"))).toBe(true);
    expect(result.warnings.some((w: string) => w.includes("$35"))).toBe(true);
  });

  it("does not warn when weee has enough items", async () => {
    const r1 = await recipeRepo.create({
      title: "Korean Feast",
      source: "manual",
      instructions: "Cook",
      ingredients: [
        { name: "gochujang", quantity: 2, unit: "tbsp", category: "pantry" },
        { name: "miso", quantity: 1, unit: "tbsp", category: "pantry" },
        { name: "tofu", quantity: 1, unit: "block", category: "protein" },
        { name: "bok choy", quantity: 2, unit: "heads", category: "produce" },
      ],
    });

    const plan = await mealPlanRepo.create({
      name: "Test",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [{ dayOfWeek: 0, mealType: "dinner", recipeId: r1.id, category: "exploit" }],
    });

    const result = await service.generateFromPlan(plan.id);
    expect(result.warnings).toHaveLength(0);
  });
});
