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

  // Spec rule 1: "Fuzzy match on name — 'yellow onion' and 'onion' are the same"
  it("fuzzy-merges 'yellow onion' and 'onion' into one item", async () => {
    const r1 = await recipeRepo.create({
      title: "Recipe A", source: "manual", instructions: "Cook",
      ingredients: [{ name: "yellow onion", quantity: 2, unit: "count", category: "produce" }],
    });
    const r2 = await recipeRepo.create({
      title: "Recipe B", source: "manual", instructions: "Cook",
      ingredients: [{ name: "onion", quantity: 1, unit: "count", category: "produce" }],
    });

    const plan = await mealPlanRepo.create({
      name: "Test",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [
        { dayOfWeek: 0, mealType: "dinner", recipeId: r1.id, category: "exploit" },
        { dayOfWeek: 1, mealType: "dinner", recipeId: r2.id, category: "exploit" },
      ],
    });

    const result = await service.generateFromPlan(plan.id);
    const onions = result.list.items.filter((i: any) =>
      i.name.toLowerCase().includes("onion")
    );
    expect(onions).toHaveLength(1);
    expect(onions[0].quantity).toBe(3); // 2 + 1
  });

  it("fuzzy-merges 'red bell pepper' and 'bell pepper'", async () => {
    const r1 = await recipeRepo.create({
      title: "Recipe A", source: "manual", instructions: "Cook",
      ingredients: [{ name: "red bell pepper", quantity: 2, unit: "count", category: "produce" }],
    });
    const r2 = await recipeRepo.create({
      title: "Recipe B", source: "manual", instructions: "Cook",
      ingredients: [{ name: "bell pepper", quantity: 1, unit: "count", category: "produce" }],
    });

    const plan = await mealPlanRepo.create({
      name: "Test",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [
        { dayOfWeek: 0, mealType: "dinner", recipeId: r1.id, category: "exploit" },
        { dayOfWeek: 1, mealType: "dinner", recipeId: r2.id, category: "exploit" },
      ],
    });

    const result = await service.generateFromPlan(plan.id);
    const peppers = result.list.items.filter((i: any) =>
      i.name.toLowerCase().includes("pepper")
    );
    expect(peppers).toHaveLength(1);
    expect(peppers[0].quantity).toBe(3);
  });

  it("does NOT merge distinct items like 'chicken thighs' and 'chicken breast'", async () => {
    const r1 = await recipeRepo.create({
      title: "Recipe A", source: "manual", instructions: "Cook",
      ingredients: [{ name: "chicken thighs", quantity: 2, unit: "lbs", category: "protein" }],
    });
    const r2 = await recipeRepo.create({
      title: "Recipe B", source: "manual", instructions: "Cook",
      ingredients: [{ name: "chicken breast", quantity: 1, unit: "lbs", category: "protein" }],
    });

    const plan = await mealPlanRepo.create({
      name: "Test",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [
        { dayOfWeek: 0, mealType: "dinner", recipeId: r1.id, category: "exploit" },
        { dayOfWeek: 1, mealType: "dinner", recipeId: r2.id, category: "exploit" },
      ],
    });

    const result = await service.generateFromPlan(plan.id);
    const chicken = result.list.items.filter((i: any) =>
      i.name.toLowerCase().includes("chicken")
    );
    expect(chicken).toHaveLength(2);
  });

  it("prefers the more specific name when fuzzy-merging", async () => {
    const r1 = await recipeRepo.create({
      title: "Recipe A", source: "manual", instructions: "Cook",
      ingredients: [{ name: "onion", quantity: 1, unit: "count", category: "produce" }],
    });
    const r2 = await recipeRepo.create({
      title: "Recipe B", source: "manual", instructions: "Cook",
      ingredients: [{ name: "yellow onion", quantity: 2, unit: "count", category: "produce" }],
    });

    const plan = await mealPlanRepo.create({
      name: "Test",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [
        { dayOfWeek: 0, mealType: "dinner", recipeId: r1.id, category: "exploit" },
        { dayOfWeek: 1, mealType: "dinner", recipeId: r2.id, category: "exploit" },
      ],
    });

    const result = await service.generateFromPlan(plan.id);
    const onions = result.list.items.filter((i: any) =>
      i.name.toLowerCase().includes("onion")
    );
    expect(onions).toHaveLength(1);
    expect(onions[0].name).toBe("yellow onion"); // more specific wins
  });

  it("fuzzy-merges 'fresh basil' and 'basil'", async () => {
    const r1 = await recipeRepo.create({
      title: "Recipe A", source: "manual", instructions: "Cook",
      ingredients: [{ name: "fresh basil", quantity: 0.5, unit: "cup", category: "produce" }],
    });
    const r2 = await recipeRepo.create({
      title: "Recipe B", source: "manual", instructions: "Cook",
      ingredients: [{ name: "basil", quantity: 0.25, unit: "cup", category: "produce" }],
    });

    const plan = await mealPlanRepo.create({
      name: "Test",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [
        { dayOfWeek: 0, mealType: "dinner", recipeId: r1.id, category: "exploit" },
        { dayOfWeek: 1, mealType: "dinner", recipeId: r2.id, category: "exploit" },
      ],
    });

    const result = await service.generateFromPlan(plan.id);
    const basil = result.list.items.filter((i: any) =>
      i.name.toLowerCase().includes("basil")
    );
    expect(basil).toHaveLength(1);
    expect(basil[0].quantity).toBeCloseTo(0.75);
  });

  // Spec rule 6: "Pantry staples — common items excluded by default"
  it("excludes pantry staples from grocery list by default", async () => {
    const r1 = await recipeRepo.create({
      title: "Simple Pasta",
      source: "manual",
      instructions: "Cook",
      ingredients: [
        { name: "pasta", quantity: 1, unit: "lb", category: "pantry" },
        { name: "salt", quantity: 1, unit: "tsp", category: "spice" },
        { name: "olive oil", quantity: 2, unit: "tbsp", category: "pantry" },
        { name: "butter", quantity: 1, unit: "tbsp", category: "dairy" },
        { name: "garlic", quantity: 3, unit: "cloves", category: "produce" },
      ],
    });

    const plan = await mealPlanRepo.create({
      name: "Test",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [{ dayOfWeek: 0, mealType: "dinner", recipeId: r1.id, category: "exploit" }],
    });

    const result = await service.generateFromPlan(plan.id);

    // salt, olive oil, butter are pantry staples — should be excluded
    expect(result.list.items.find((i: any) => i.name === "salt")).toBeUndefined();
    expect(result.list.items.find((i: any) => i.name === "olive oil")).toBeUndefined();
    expect(result.list.items.find((i: any) => i.name === "butter")).toBeUndefined();

    // pasta and garlic are NOT pantry staples — should remain
    expect(result.list.items.find((i: any) => i.name === "pasta")).toBeDefined();
    expect(result.list.items.find((i: any) => i.name === "garlic")).toBeDefined();

    // Excluded staples should appear in subtracted with "pantry staple" result
    expect(result.subtracted.some((s: any) => s.name === "salt" && s.result === "pantry staple")).toBe(true);
    expect(result.subtracted.some((s: any) => s.name === "olive oil" && s.result === "pantry staple")).toBe(true);
  });

  it("includes pantry staples when includePantryStaples is true", async () => {
    const r1 = await recipeRepo.create({
      title: "Simple Pasta",
      source: "manual",
      instructions: "Cook",
      ingredients: [
        { name: "pasta", quantity: 1, unit: "lb", category: "pantry" },
        { name: "salt", quantity: 1, unit: "tsp", category: "spice" },
        { name: "olive oil", quantity: 2, unit: "tbsp", category: "pantry" },
      ],
    });

    const plan = await mealPlanRepo.create({
      name: "Test",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [{ dayOfWeek: 0, mealType: "dinner", recipeId: r1.id, category: "exploit" }],
    });

    const result = await service.generateFromPlan(plan.id, true, true);

    // All items should be present when staples are included
    expect(result.list.items.find((i: any) => i.name === "salt")).toBeDefined();
    expect(result.list.items.find((i: any) => i.name === "olive oil")).toBeDefined();
    expect(result.list.items.find((i: any) => i.name === "pasta")).toBeDefined();
  });

  it("keeps pantry staple on list when inventory says running low", async () => {
    // Add olive oil to inventory with "running low" note
    await inventoryRepo.add([
      { name: "olive oil", category: "pantry", quantity: 0.25, unit: "bottle", location: "pantry", notes: "running low" },
    ]);

    const r1 = await recipeRepo.create({
      title: "Salad",
      source: "manual",
      instructions: "Toss",
      ingredients: [
        { name: "olive oil", quantity: 3, unit: "tbsp", category: "pantry" },
        { name: "salt", quantity: 1, unit: "pinch", category: "spice" },
        { name: "lettuce", quantity: 1, unit: "head", category: "produce" },
      ],
    });

    const plan = await mealPlanRepo.create({
      name: "Test",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [{ dayOfWeek: 0, mealType: "dinner", recipeId: r1.id, category: "exploit" }],
    });

    const result = await service.generateFromPlan(plan.id);

    // olive oil should NOT be excluded because inventory says "running low"
    expect(result.list.items.find((i: any) => i.name === "olive oil")).toBeDefined();
    // salt should still be excluded (no inventory entry saying it's low)
    expect(result.list.items.find((i: any) => i.name === "salt")).toBeUndefined();
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
