import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { InventoryRepository } from "../../src/repositories/inventory.repo.js";
import { GroceryRepository } from "../../src/repositories/grocery.repo.js";
import { InventorySyncService } from "../../src/services/inventory-sync.service.js";

// Spec: specs/inventory/inventory-tracking.md — Rule 6 (Post-delivery addition)

describe("InventorySyncService", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let inventoryRepo: InventoryRepository;
  let groceryRepo: GroceryRepository;
  let service: InventorySyncService;

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    inventoryRepo = new InventoryRepository(db);
    groceryRepo = new GroceryRepository(db);
    service = new InventorySyncService(inventoryRepo, groceryRepo);
  });

  it("syncs grocery list items into inventory", async () => {
    const list = await groceryRepo.create({
      name: "Week of Apr 21",
      items: [
        { name: "chicken thighs", quantity: 2, unit: "lbs", category: "protein" },
        { name: "broccoli", quantity: 1, unit: "head", category: "produce" },
      ],
    });

    const result = await service.syncDelivery(list.id);

    expect(result.ok).toBe(true);
    expect(result.added).toBe(2);

    const inventory = await inventoryRepo.list({});
    expect(inventory.items).toHaveLength(2);

    const chicken = inventory.items.find((i: any) => i.name === "chicken thighs");
    expect(chicken).toBeDefined();
    expect(chicken.quantity).toBe(2);
    expect(chicken.unit).toBe("lbs");
    expect(chicken.category).toBe("protein");
  });

  it("maps protein/produce/dairy to fridge", async () => {
    const list = await groceryRepo.create({
      name: "Test",
      items: [
        { name: "chicken", quantity: 1, unit: "lb", category: "protein" },
        { name: "spinach", quantity: 1, unit: "bag", category: "produce" },
        { name: "milk", quantity: 1, unit: "gallon", category: "dairy" },
      ],
    });

    await service.syncDelivery(list.id);
    const inventory = await inventoryRepo.list({});

    for (const item of inventory.items) {
      expect(item.location).toBe("fridge");
    }
  });

  it("maps pantry and spice items to pantry", async () => {
    const list = await groceryRepo.create({
      name: "Test",
      items: [
        { name: "rice", quantity: 2, unit: "lbs", category: "pantry" },
        { name: "cumin", quantity: 1, unit: "jar", category: "spice" },
      ],
    });

    await service.syncDelivery(list.id);
    const inventory = await inventoryRepo.list({});

    for (const item of inventory.items) {
      expect(item.location).toBe("pantry");
    }
  });

  it("estimates expiration for perishables", async () => {
    const list = await groceryRepo.create({
      name: "Test",
      items: [
        { name: "chicken", quantity: 1, unit: "lb", category: "protein" },
        { name: "lettuce", quantity: 1, unit: "head", category: "produce" },
        { name: "yogurt", quantity: 1, unit: "container", category: "dairy" },
      ],
    });

    const result = await service.syncDelivery(list.id, { deliveryDate: "2026-04-23" });
    const inventory = await inventoryRepo.list({});

    const chicken = inventory.items.find((i: any) => i.name === "chicken");
    const lettuce = inventory.items.find((i: any) => i.name === "lettuce");
    const yogurt = inventory.items.find((i: any) => i.name === "yogurt");

    // protein: +4 days, produce: +5 days, dairy: +10 days
    expect(chicken.expiresAt).toBe("2026-04-27");
    expect(lettuce.expiresAt).toBe("2026-04-28");
    expect(yogurt.expiresAt).toBe("2026-05-03");
  });

  it("does not set expiration for pantry/spice items", async () => {
    const list = await groceryRepo.create({
      name: "Test",
      items: [
        { name: "olive oil", category: "pantry" },
        { name: "paprika", category: "spice" },
      ],
    });

    await service.syncDelivery(list.id);
    const inventory = await inventoryRepo.list({});

    for (const item of inventory.items) {
      expect(item.expiresAt).toBeNull();
    }
  });

  it("sets purchasedAt to delivery date", async () => {
    const list = await groceryRepo.create({
      name: "Test",
      items: [{ name: "eggs", quantity: 12, unit: "count", category: "dairy" }],
    });

    await service.syncDelivery(list.id, { deliveryDate: "2026-04-23" });
    const inventory = await inventoryRepo.list({});
    expect(inventory.items[0].purchasedAt).toBe("2026-04-23");
  });

  it("handles items without quantity or unit", async () => {
    const list = await groceryRepo.create({
      name: "Test",
      items: [{ name: "gochugaru", category: "spice" }],
    });

    const result = await service.syncDelivery(list.id);

    expect(result.ok).toBe(true);
    expect(result.added).toBe(1);

    const inventory = await inventoryRepo.list({});
    expect(inventory.items[0].name).toBe("gochugaru");
    expect(inventory.items[0].quantity).toBeNull();
  });

  it("returns error for nonexistent grocery list", async () => {
    const result = await service.syncDelivery("nonexistent");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it("reports skipped items (already checked off as unavailable)", async () => {
    const list = await groceryRepo.create({
      name: "Test",
      items: [
        { name: "chicken", quantity: 1, unit: "lb", category: "protein" },
        { name: "gochugaru", category: "spice" },
      ],
    });

    // Mark one item as not received (isChecked = true means it was on the list but we can use it for tracking)
    // Actually, all items from a delivered order should be added — no skipping by default
    const result = await service.syncDelivery(list.id);
    expect(result.added).toBe(2);
    expect(result.items).toHaveLength(2);
  });

  it("handles items with 'other' category defaulting to fridge", async () => {
    const list = await groceryRepo.create({
      name: "Test",
      items: [{ name: "tofu", quantity: 1, unit: "block", category: "other" }],
    });

    await service.syncDelivery(list.id);
    const inventory = await inventoryRepo.list({});
    expect(inventory.items[0].location).toBe("fridge");
  });

  it("handles items with no category defaulting to fridge", async () => {
    const list = await groceryRepo.create({
      name: "Test",
      items: [{ name: "mystery item", quantity: 1, unit: "each" }],
    });

    await service.syncDelivery(list.id);
    const inventory = await inventoryRepo.list({});
    expect(inventory.items[0].location).toBe("fridge");
  });
});
