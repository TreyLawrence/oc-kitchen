import { describe, it, expect, beforeEach } from "vitest";
import { createIntegrationHarness, type IntegrationHarness } from "./helpers/harness.js";
import { seedFixtures } from "./helpers/fixtures.js";

describe("Inventory workflows", () => {
  let h: IntegrationHarness;

  beforeEach(() => {
    h = createIntegrationHarness();
  });

  it("adds inventory items and lists them", async () => {
    const addResult = await h.call("update_inventory", {
      add: [
        { name: "chicken thighs", category: "protein", quantity: 2, unit: "lbs", location: "fridge" },
        { name: "arborio rice", category: "pantry", quantity: 1, unit: "bag", location: "pantry" },
        { name: "broccoli", category: "produce", quantity: 1, unit: "head", location: "fridge" },
      ],
    });
    expect(addResult.success).toBe(true);
    expect(addResult.data.added).toBe(3);

    const listResult = await h.call("list_inventory", {});
    expect(listResult.success).toBe(true);
    expect(listResult.data.items).toHaveLength(3);

    const names = listResult.data.items.map((i: any) => i.name);
    expect(names).toContain("chicken thighs");
    expect(names).toContain("arborio rice");
    expect(names).toContain("broccoli");
  });
  it("filters inventory by location", async () => {
    await h.call("update_inventory", {
      add: [
        { name: "milk", category: "dairy", quantity: 1, unit: "gallon", location: "fridge" },
        { name: "flour", category: "pantry", quantity: 5, unit: "lbs", location: "pantry" },
      ],
    });

    const fridgeResult = await h.call("list_inventory", { location: "fridge" });
    expect(fridgeResult.data.items).toHaveLength(1);
    expect(fridgeResult.data.items[0].name).toBe("milk");

    const pantryResult = await h.call("list_inventory", { location: "pantry" });
    expect(pantryResult.data.items).toHaveLength(1);
    expect(pantryResult.data.items[0].name).toBe("flour");
  });
  it("updates an existing inventory item's quantity", async () => {
    await h.call("update_inventory", {
      add: [{ name: "eggs", category: "dairy", quantity: 12, unit: "count", location: "fridge" }],
    });

    const listBefore = await h.call("list_inventory", {});
    const eggItem = listBefore.data.items.find((i: any) => i.name === "eggs");
    expect(eggItem.quantity).toBe(12);

    await h.call("update_inventory", {
      update: [{ id: eggItem.id, quantity: 6 }],
    });

    const listAfter = await h.call("list_inventory", {});
    const updatedEgg = listAfter.data.items.find((i: any) => i.name === "eggs");
    expect(updatedEgg.quantity).toBe(6);
  });
  it("removes inventory items", async () => {
    await h.call("update_inventory", {
      add: [
        { name: "butter", category: "dairy", quantity: 1, unit: "lb", location: "fridge" },
        { name: "sugar", category: "pantry", quantity: 2, unit: "lbs", location: "pantry" },
      ],
    });

    const listBefore = await h.call("list_inventory", {});
    expect(listBefore.data.items).toHaveLength(2);
    const butterId = listBefore.data.items.find((i: any) => i.name === "butter").id;

    await h.call("update_inventory", { remove: [butterId] });

    const listAfter = await h.call("list_inventory", {});
    expect(listAfter.data.items).toHaveLength(1);
    expect(listAfter.data.items[0].name).toBe("sugar");
  });
  it("verifies inventory — fresh items are confident, stale items need check", async () => {
    const staleTimestamp = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days ago

    await h.repos.inventory.add([
      { name: "fresh chicken", category: "protein", quantity: 2, unit: "lbs", location: "fridge" },
    ]);
    const allItems = (await h.repos.inventory.list({})).items;
    const chickenId = allItems[0].id;

    // Add a pantry item (30-day threshold — stays confident)
    await h.repos.inventory.add([
      { name: "olive oil", category: "pantry", quantity: 1, unit: "bottle", location: "pantry" },
    ]);

    // Backdate the chicken's updatedAt via repo update trick — use raw sqlite
    h.sqlite.exec(`UPDATE inventory_items SET updated_at = '${staleTimestamp}' WHERE id = '${chickenId}'`);

    const verifyResult = await h.call("verify_inventory", {});
    expect(verifyResult.success).toBe(true);
    expect(verifyResult.data.ok).toBe(true);

    // Olive oil should be confident (pantry = 30-day threshold, just added)
    const confidentNames = verifyResult.data.confident.map((i: any) => i.name);
    expect(confidentNames).toContain("olive oil");

    // Chicken should need check (protein = 5-day threshold, 10 days old)
    const needsCheckNames = verifyResult.data.needsCheck.map((i: any) => i.name);
    expect(needsCheckNames).toContain("fresh chicken");
    expect(verifyResult.data.allFresh).toBe(false);
    expect(verifyResult.data.question).toContain("fresh chicken");
  });
  it("syncs a delivered grocery list into inventory", async () => {
    // Create a grocery list with items
    const createResult = await h.call("create_grocery_list", {
      name: "Weekly groceries",
      items: [
        { name: "salmon", quantity: 1, unit: "lb", category: "protein" },
        { name: "spinach", quantity: 1, unit: "bag", category: "produce" },
        { name: "soy sauce", quantity: 1, unit: "bottle", category: "pantry" },
      ],
    });
    expect(createResult.success).toBe(true);
    const listId = createResult.data.list.id;

    // Sync delivery to inventory
    const syncResult = await h.call("sync_delivery_to_inventory", {
      groceryListId: listId,
      deliveryDate: "2026-04-24",
    });
    expect(syncResult.success).toBe(true);
    expect(syncResult.data.ok).toBe(true);
    expect(syncResult.data.added).toBe(3);

    // Verify items appeared in inventory
    const inventoryResult = await h.call("list_inventory", {});
    expect(inventoryResult.data.items).toHaveLength(3);

    const salmon = inventoryResult.data.items.find((i: any) => i.name === "salmon");
    expect(salmon).toBeTruthy();
    expect(salmon.location).toBe("fridge"); // protein -> fridge
    expect(salmon.expiresAt).toBe("2026-04-28"); // protein = +4 days

    const spinach = inventoryResult.data.items.find((i: any) => i.name === "spinach");
    expect(spinach.location).toBe("fridge"); // produce -> fridge
    expect(spinach.expiresAt).toBe("2026-04-29"); // produce = +5 days

    const soySauce = inventoryResult.data.items.find((i: any) => i.name === "soy sauce");
    expect(soySauce.location).toBe("pantry"); // pantry -> pantry
    expect(soySauce.expiresAt).toBeNull(); // pantry has no expiration
  });

  it("sync_delivery_to_inventory fails for nonexistent grocery list", async () => {
    const result = await h.call("sync_delivery_to_inventory", {
      groceryListId: "nonexistent",
    });
    expect(result.success).toBe(false);
    expect(result.data.error).toContain("not found");
  });
});

describe("Grocery workflows", () => {
  let h: IntegrationHarness;

  beforeEach(() => {
    h = createIntegrationHarness();
  });

  it("creates a grocery list and retrieves it", async () => {
    const createResult = await h.call("create_grocery_list", {
      name: "Party supplies",
      items: [
        { name: "chips", quantity: 3, unit: "bags", category: "other" },
        { name: "salsa", quantity: 2, unit: "jars", category: "pantry" },
      ],
    });
    expect(createResult.success).toBe(true);
    expect(createResult.data.list.name).toBe("Party supplies");
    expect(createResult.data.list.items).toHaveLength(2);

    const listId = createResult.data.list.id;
    const getResult = await h.call("get_grocery_list", { id: listId });
    expect(getResult.success).toBe(true);
    expect(getResult.data.list.name).toBe("Party supplies");
    expect(getResult.data.list.items).toHaveLength(2);
  });

  it("lists all grocery lists when no id given", async () => {
    await h.call("create_grocery_list", {
      name: "List A",
      items: [{ name: "apples" }],
    });
    await h.call("create_grocery_list", {
      name: "List B",
      items: [{ name: "bananas" }],
    });

    const result = await h.call("get_grocery_list", {});
    expect(result.success).toBe(true);
    expect(result.data.lists).toHaveLength(2);
  });

  it("updates a grocery list — add items, remove items, change status", async () => {
    const createResult = await h.call("create_grocery_list", {
      name: "Weeknight basics",
      items: [
        { name: "pasta", quantity: 1, unit: "box" },
        { name: "marinara", quantity: 1, unit: "jar" },
      ],
    });
    const listId = createResult.data.list.id;
    const pastaItemId = createResult.data.list.items.find((i: any) => i.name === "pasta").id;

    // Add an item, remove pasta, finalize the list
    const updateResult = await h.call("update_grocery_list", {
      id: listId,
      status: "finalized",
      addItems: [{ name: "parmesan", quantity: 4, unit: "oz", store: "instacart" }],
      removeItems: [pastaItemId],
    });
    expect(updateResult.success).toBe(true);
    expect(updateResult.data.list.status).toBe("finalized");

    const itemNames = updateResult.data.list.items.map((i: any) => i.name);
    expect(itemNames).toContain("marinara");
    expect(itemNames).toContain("parmesan");
    expect(itemNames).not.toContain("pasta");
  });

  it("updates individual item properties (store, checked, quantity)", async () => {
    const createResult = await h.call("create_grocery_list", {
      name: "Test list",
      items: [{ name: "milk", quantity: 1, unit: "gallon" }],
    });
    const listId = createResult.data.list.id;
    const milkId = createResult.data.list.items[0].id;

    const updateResult = await h.call("update_grocery_list", {
      id: listId,
      updateItems: [{ id: milkId, store: "instacart", isChecked: true, quantity: 2 }],
    });

    const milk = updateResult.data.list.items.find((i: any) => i.id === milkId);
    expect(milk.store).toBe("instacart");
    expect(milk.isChecked).toBe(true);
    expect(milk.quantity).toBe(2);
  });

  it("generates a grocery list from a meal plan with recipe ingredients", async () => {
    const { recipeIds } = await seedFixtures(h);

    // Create a meal plan with two recipes
    const planResult = await h.call("create_meal_plan", {
      name: "Week of Apr 27",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [
        { dayOfWeek: 0, mealType: "dinner", recipeId: recipeIds.sheetPanChicken, category: "exploit" },
        { dayOfWeek: 2, mealType: "dinner", recipeId: recipeIds.risotto, category: "exploit" },
      ],
    });
    expect(planResult.success).toBe(true);
    const planId = planResult.data.plan.id;

    // Generate grocery list (include pantry staples so we can see everything)
    const genResult = await h.call("generate_grocery_list", {
      mealPlanId: planId,
      subtractInventory: false,
      includePantryStaples: true,
    });
    expect(genResult.success).toBe(true);
    expect(genResult.data.list).toBeTruthy();
    expect(genResult.data.list.items.length).toBeGreaterThan(0);
    expect(genResult.data.list.mealPlanId).toBe(planId);

    // Should have ingredients from both recipes
    const itemNames = genResult.data.list.items.map((i: any) => i.name.toLowerCase());
    expect(itemNames.some((n: string) => n.includes("chicken"))).toBe(true);
    expect(itemNames.some((n: string) => n.includes("mushroom"))).toBe(true);
    expect(itemNames.some((n: string) => n.includes("broccoli"))).toBe(true);

    // Store breakdown should exist
    expect(genResult.data.storeBreakdown).toBeTruthy();
  });

  it("subtracts existing inventory when generating a grocery list", async () => {
    const { recipeIds } = await seedFixtures(h);

    // Add broccoli to inventory (sheet pan chicken needs 1 head)
    await h.call("update_inventory", {
      add: [{ name: "broccoli", category: "produce", quantity: 2, unit: "head", location: "fridge" }],
    });

    // Create a meal plan with sheet pan chicken
    const planResult = await h.call("create_meal_plan", {
      name: "Week of Apr 27",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [
        { dayOfWeek: 0, mealType: "dinner", recipeId: recipeIds.sheetPanChicken, category: "exploit" },
      ],
    });
    const planId = planResult.data.plan.id;

    // Generate with inventory subtraction
    const genResult = await h.call("generate_grocery_list", {
      mealPlanId: planId,
      subtractInventory: true,
      includePantryStaples: true,
    });
    expect(genResult.success).toBe(true);

    // Broccoli should have been subtracted (we have 2, need 1 → skipped)
    const subtractedNames = genResult.data.subtracted.map((s: any) => s.name);
    expect(subtractedNames.some((n: string) => n.toLowerCase().includes("broccoli"))).toBe(true);

    // Broccoli should NOT be on the grocery list
    const groceryNames = genResult.data.list.items.map((i: any) => i.name.toLowerCase());
    expect(groceryNames.some((n: string) => n.includes("broccoli"))).toBe(false);
  });

  it("excludes pantry staples by default", async () => {
    const { recipeIds } = await seedFixtures(h);

    const planResult = await h.call("create_meal_plan", {
      name: "Week of Apr 27",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [
        { dayOfWeek: 0, mealType: "dinner", recipeId: recipeIds.sheetPanChicken, category: "exploit" },
      ],
    });
    const planId = planResult.data.plan.id;

    // Generate WITHOUT including pantry staples (default)
    const genResult = await h.call("generate_grocery_list", {
      mealPlanId: planId,
      subtractInventory: false,
    });
    expect(genResult.success).toBe(true);

    // Olive oil is a pantry staple — should be excluded
    const groceryNames = genResult.data.list.items.map((i: any) => i.name.toLowerCase());
    expect(groceryNames).not.toContain("olive oil");

    // Should be listed in subtracted as "pantry staple"
    const oliveOilSubtracted = genResult.data.subtracted.find(
      (s: any) => s.name.toLowerCase() === "olive oil"
    );
    expect(oliveOilSubtracted).toBeTruthy();
    expect(oliveOilSubtracted.result).toBe("pantry staple");
  });

  it("assigns stores correctly — proteins to butcherbox, Asian items to weee, default to instacart", async () => {
    const { recipeIds } = await seedFixtures(h);

    // Enable ButcherBox subscription with an open cutoff window
    await h.repos.userProfile.setPreference("butcherbox_subscription", true);
    await h.repos.userProfile.setPreference("butcherbox_cutoff_date", "2026-05-10");
    await h.repos.userProfile.setPreference("butcherbox_delivery_date", "2026-05-15");

    // Create meal plan with mapo tofu (Asian) and sheet pan chicken (protein)
    const planResult = await h.call("create_meal_plan", {
      name: "Store test",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [
        { dayOfWeek: 0, mealType: "dinner", recipeId: recipeIds.mapoTofu, category: "explore" },
        { dayOfWeek: 2, mealType: "dinner", recipeId: recipeIds.sheetPanChicken, category: "exploit" },
      ],
    });
    const planId = planResult.data.plan.id;

    const genResult = await h.call("generate_grocery_list", {
      mealPlanId: planId,
      subtractInventory: false,
      includePantryStaples: true,
    });
    expect(genResult.success).toBe(true);

    const items = genResult.data.list.items;

    // Chicken thighs → butcherbox (protein + BB subscription)
    const chicken = items.find((i: any) => i.name.toLowerCase().includes("chicken thigh"));
    expect(chicken).toBeTruthy();
    expect(chicken.store).toBe("butcherbox");

    // Doubanjiang → weee (Asian specialty)
    const doubanjiang = items.find((i: any) => i.name.toLowerCase().includes("doubanjiang"));
    expect(doubanjiang).toBeTruthy();
    expect(doubanjiang.store).toBe("weee");

    // Sichuan peppercorn → weee (Asian specialty)
    const sichuan = items.find((i: any) => i.name.toLowerCase().includes("sichuan"));
    expect(sichuan).toBeTruthy();
    expect(sichuan.store).toBe("weee");

    // Produce (broccoli, sweet potato) → instacart
    const broccoli = items.find((i: any) => i.name.toLowerCase().includes("broccoli"));
    expect(broccoli).toBeTruthy();
    expect(broccoli.store).toBe("instacart");
  });

  it("proteins go to instacart when no butcherbox subscription", async () => {
    const { recipeIds } = await seedFixtures(h);

    // No butcherbox subscription set (default)
    const planResult = await h.call("create_meal_plan", {
      name: "No BB",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [
        { dayOfWeek: 0, mealType: "dinner", recipeId: recipeIds.sheetPanChicken, category: "exploit" },
      ],
    });
    const planId = planResult.data.plan.id;

    const genResult = await h.call("generate_grocery_list", {
      mealPlanId: planId,
      subtractInventory: false,
      includePantryStaples: true,
    });

    const chicken = genResult.data.list.items.find((i: any) =>
      i.name.toLowerCase().includes("chicken")
    );
    expect(chicken).toBeTruthy();
    expect(chicken.store).toBe("instacart");
  });

  it("generate_grocery_list fails for nonexistent meal plan", async () => {
    const result = await h.call("generate_grocery_list", {
      mealPlanId: "nonexistent",
    });
    expect(result.success).toBe(false);
    expect(result.data.error).toContain("not found");
  });

  it("skips leftover entries when generating grocery list", async () => {
    const { recipeIds } = await seedFixtures(h);

    const planResult = await h.call("create_meal_plan", {
      name: "With leftovers",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [
        { dayOfWeek: 0, mealType: "dinner", recipeId: recipeIds.sheetPanChicken, category: "exploit" },
        { dayOfWeek: 1, mealType: "lunch", recipeId: recipeIds.sheetPanChicken, category: "leftover", customTitle: "Leftover: Sheet Pan Chicken" },
      ],
    });
    const planId = planResult.data.plan.id;

    const genResult = await h.call("generate_grocery_list", {
      mealPlanId: planId,
      subtractInventory: false,
      includePantryStaples: true,
    });
    expect(genResult.success).toBe(true);

    // Should only have ingredients for one serving of sheet pan chicken,
    // not doubled from the leftover entry
    const chickenItems = genResult.data.list.items.filter((i: any) =>
      i.name.toLowerCase().includes("chicken")
    );
    expect(chickenItems).toHaveLength(1);
    expect(chickenItems[0].quantity).toBe(2); // 2 lbs, not 4
  });

  it("aggregates duplicate ingredients across recipes", async () => {
    const { recipeIds } = await seedFixtures(h);

    // Both risotto and mapo tofu use chicken stock
    const planResult = await h.call("create_meal_plan", {
      name: "Aggregate test",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [
        { dayOfWeek: 0, mealType: "dinner", recipeId: recipeIds.risotto, category: "exploit" },
        { dayOfWeek: 2, mealType: "dinner", recipeId: recipeIds.mapoTofu, category: "explore" },
      ],
    });
    const planId = planResult.data.plan.id;

    const genResult = await h.call("generate_grocery_list", {
      mealPlanId: planId,
      subtractInventory: false,
      includePantryStaples: true,
    });
    expect(genResult.success).toBe(true);

    // Chicken stock should appear once with aggregated quantity (6 + 1 = 7 cups)
    const stockItems = genResult.data.list.items.filter((i: any) =>
      i.name.toLowerCase().includes("chicken stock")
    );
    expect(stockItems).toHaveLength(1);
    expect(stockItems[0].quantity).toBe(7);
  });
});
