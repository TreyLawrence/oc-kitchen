import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { InventoryRepository } from "../../src/repositories/inventory.repo.js";
import { RecipeRepository } from "../../src/repositories/recipe.repo.js";
import { UserProfileRepository } from "../../src/repositories/user-profile.repo.js";
import { InventoryDeductionService } from "../../src/services/inventory-deduction.service.js";

// Spec: specs/inventory/inventory-tracking.md — deduct_recipe_ingredients

describe("InventoryDeductionService", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let inventoryRepo: InventoryRepository;
  let recipeRepo: RecipeRepository;
  let profileRepo: UserProfileRepository;
  let service: InventoryDeductionService;

  beforeEach(async () => {
    const testDb = createTestDb();
    db = testDb.db;
    inventoryRepo = new InventoryRepository(db);
    recipeRepo = new RecipeRepository(db);
    profileRepo = new UserProfileRepository(db);
    service = new InventoryDeductionService(inventoryRepo, recipeRepo, profileRepo);
  });

  it("deducts recipe ingredients from inventory", async () => {
    // Set up inventory
    await inventoryRepo.add([
      { name: "chicken thighs", category: "protein", quantity: 4, unit: "lbs", location: "fridge" },
      { name: "gochujang", category: "pantry", quantity: 10, unit: "tbsp", location: "pantry" },
    ]);

    // Create recipe
    const recipe = await recipeRepo.create({
      title: "Gochujang Chicken",
      source: "manual",
      instructions: "Cook it",
      ingredients: [
        { name: "chicken thighs", quantity: 2, unit: "lbs", category: "protein" },
        { name: "gochujang", quantity: 3, unit: "tbsp", category: "pantry" },
      ],
    });

    const result = await service.deductForRecipe(recipe.id);

    expect(result.deducted).toHaveLength(2);
    expect(result.unmatched).toHaveLength(0);

    // Check remaining quantities
    const inventory = await inventoryRepo.list({});
    const chicken = inventory.items.find((i: any) => i.name === "chicken thighs");
    const gochujang = inventory.items.find((i: any) => i.name === "gochujang");
    expect(chicken!.quantity).toBe(2); // 4 - 2
    expect(gochujang!.quantity).toBe(7); // 10 - 3
  });

  it("removes items that reach zero", async () => {
    await inventoryRepo.add([
      { name: "eggs", category: "dairy", quantity: 2, unit: "count", location: "fridge" },
    ]);

    const recipe = await recipeRepo.create({
      title: "Scrambled Eggs",
      source: "manual",
      instructions: "Scramble them",
      ingredients: [{ name: "eggs", quantity: 2, unit: "count", category: "dairy" }],
    });

    const result = await service.deductForRecipe(recipe.id);

    expect(result.deducted).toHaveLength(1);
    expect(result.deducted[0].removed).toBe(true);

    const inventory = await inventoryRepo.list({});
    const eggs = inventory.items.find((i: any) => i.name === "eggs");
    expect(eggs).toBeUndefined();
  });

  it("reports unmatched ingredients", async () => {
    // Empty inventory
    const recipe = await recipeRepo.create({
      title: "Something",
      source: "manual",
      instructions: "Cook it",
      ingredients: [
        { name: "truffle oil", quantity: 1, unit: "tbsp", category: "pantry" },
      ],
    });

    const result = await service.deductForRecipe(recipe.id);

    expect(result.deducted).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0].ingredient).toBe("truffle oil");
  });

  it("handles ingredients with no quantity (pantry staples)", async () => {
    await inventoryRepo.add([
      { name: "soy sauce", category: "pantry", location: "pantry" }, // no quantity
    ]);

    const recipe = await recipeRepo.create({
      title: "Stir Fry",
      source: "manual",
      instructions: "Wok it",
      ingredients: [{ name: "soy sauce", quantity: 2, unit: "tbsp", category: "pantry" }],
    });

    const result = await service.deductForRecipe(recipe.id);

    // Should match but not remove (can't subtract from null quantity)
    expect(result.deducted).toHaveLength(1);
    expect(result.deducted[0].removed).toBe(false);
  });

  it("uses fuzzy matching for ingredient names", async () => {
    await inventoryRepo.add([
      { name: "chicken thighs, boneless skinless", category: "protein", quantity: 3, unit: "lbs", location: "fridge" },
    ]);

    const recipe = await recipeRepo.create({
      title: "Chicken",
      source: "manual",
      instructions: "Cook it",
      ingredients: [{ name: "chicken thighs", quantity: 2, unit: "lbs", category: "protein" }],
    });

    const result = await service.deductForRecipe(recipe.id);
    expect(result.deducted).toHaveLength(1);

    const inventory = await inventoryRepo.list({});
    expect(inventory.items[0].quantity).toBe(1); // 3 - 2
  });

  // Spec: "Compare recipe servings to household_size. If servings > household_size,
  // create a leftover inventory item."

  it("creates leftover when recipe serves more than household", async () => {
    await profileRepo.setPreference("household_size", 2);

    const recipe = await recipeRepo.create({
      title: "Gochujang Chicken",
      source: "manual",
      instructions: "Cook it",
      servings: 4,
      ingredients: [
        { name: "chicken thighs", quantity: 2, unit: "lbs", category: "protein" },
      ],
    });
    await inventoryRepo.add([
      { name: "chicken thighs", category: "protein", quantity: 2, unit: "lbs", location: "fridge" },
    ]);

    const result = await service.deductForRecipe(recipe.id);

    expect(result.leftovers.created).toBe(true);
    expect(result.leftovers.name).toBe("Leftover: Gochujang Chicken");
    expect(result.leftovers.portions).toBe(2); // 4 servings - 2 household
    expect(result.leftovers.location).toBe("fridge");
    expect(result.leftovers.suggestFreezing).toBe(false);

    // Verify leftover was added to inventory
    const inventory = await inventoryRepo.list({ query: "Leftover" });
    expect(inventory.items).toHaveLength(1);
    expect(inventory.items[0].name).toBe("Leftover: Gochujang Chicken");
    expect(inventory.items[0].quantity).toBe(2);
    expect(inventory.items[0].unit).toBe("portions");
    expect(inventory.items[0].isLeftover).toBeTruthy();
    expect(inventory.items[0].sourceRecipeId).toBe(recipe.id);
  });

  it("suggests freezing when 4+ extra portions", async () => {
    await profileRepo.setPreference("household_size", 2);

    const recipe = await recipeRepo.create({
      title: "Big Batch Chili",
      source: "manual",
      instructions: "Simmer it",
      servings: 8,
      ingredients: [],
    });

    const result = await service.deductForRecipe(recipe.id);

    expect(result.leftovers.created).toBe(true);
    expect(result.leftovers.portions).toBe(6); // 8 - 2
    expect(result.leftovers.suggestFreezing).toBe(true);
  });

  it("does not create leftover when servings <= household size", async () => {
    await profileRepo.setPreference("household_size", 4);

    const recipe = await recipeRepo.create({
      title: "Small Batch",
      source: "manual",
      instructions: "Cook it",
      servings: 4,
      ingredients: [],
    });

    const result = await service.deductForRecipe(recipe.id);

    expect(result.leftovers.created).toBe(false);
    expect(result.leftovers.portions).toBeNull();
  });

  it("does not create leftover when recipe has no servings", async () => {
    const recipe = await recipeRepo.create({
      title: "No Servings",
      source: "manual",
      instructions: "Cook it",
      ingredients: [],
    });

    const result = await service.deductForRecipe(recipe.id);

    expect(result.leftovers.created).toBe(false);
  });

  it("defaults household size to 2 when not set", async () => {
    // No household_size preference set
    const recipe = await recipeRepo.create({
      title: "Dinner for Four",
      source: "manual",
      instructions: "Cook it",
      servings: 4,
      ingredients: [],
    });

    const result = await service.deductForRecipe(recipe.id);

    expect(result.leftovers.created).toBe(true);
    expect(result.leftovers.portions).toBe(2); // 4 - 2 (default)
  });
});
