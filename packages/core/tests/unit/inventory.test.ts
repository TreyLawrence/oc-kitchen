import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { InventoryRepository } from "../../src/repositories/inventory.repo.js";

// Spec: specs/inventory/inventory-tracking.md

describe("InventoryRepository", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let repo: InventoryRepository;

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    repo = new InventoryRepository(db);
  });

  describe("add", () => {
    it("adds items to inventory", async () => {
      const added = await repo.add([
        { name: "chicken thighs", category: "protein", quantity: 2, unit: "lbs", location: "fridge", expiresAt: "2026-04-28" },
        { name: "soy sauce", category: "pantry", location: "pantry" },
      ]);

      expect(added).toHaveLength(2);
      expect(added[0].name).toBe("chicken thighs");
      expect(added[1].name).toBe("soy sauce");
    });

    // Spec: Rule 7 — "No duplicate policing"
    it("allows duplicate items", async () => {
      await repo.add([{ name: "chicken", category: "protein", quantity: 1, unit: "lb", location: "fridge" }]);
      await repo.add([{ name: "chicken", category: "protein", quantity: 2, unit: "lbs", location: "freezer" }]);

      const items = await repo.list({});
      expect(items.items).toHaveLength(2);
    });

    // Spec: Rule 8 — "Pantry staples don't need expiration dates or precise quantities"
    it("allows items without quantity or expiration", async () => {
      const added = await repo.add([{ name: "olive oil", location: "pantry" }]);
      expect(added[0].quantity).toBeNull();
      expect(added[0].expiresAt).toBeNull();
    });
  });

  describe("list", () => {
    beforeEach(async () => {
      await repo.add([
        { name: "chicken thighs", category: "protein", quantity: 2, unit: "lbs", location: "fridge", expiresAt: "2026-04-25" },
        { name: "frozen peas", category: "produce", quantity: 1, unit: "bag", location: "freezer" },
        { name: "soy sauce", category: "pantry", location: "pantry" },
        { name: "eggs", category: "dairy", quantity: 12, unit: "count", location: "fridge", expiresAt: "2026-04-24" },
      ]);
    });

    it("lists all items", async () => {
      const result = await repo.list({});
      expect(result.items).toHaveLength(4);
    });

    it("filters by location", async () => {
      const result = await repo.list({ location: "fridge" });
      expect(result.items).toHaveLength(2);
      expect(result.items.every((i: any) => i.location === "fridge")).toBe(true);
    });

    it("filters by category", async () => {
      const result = await repo.list({ category: "protein" });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe("chicken thighs");
    });

    it("searches by name", async () => {
      const result = await repo.list({ query: "chicken" });
      expect(result.items).toHaveLength(1);
    });

    // Spec: Rule 2 — "Expiring soon = within 3 days"
    it("filters expiring soon items", async () => {
      // Set "now" context: items expiring within 3 days of 2026-04-23
      const result = await repo.list({ expiringSoon: true, asOfDate: "2026-04-23" });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      expect(result.items.some((i: any) => i.name === "eggs")).toBe(true); // expires 04-24
      expect(result.items.some((i: any) => i.name === "chicken thighs")).toBe(true); // expires 04-25
    });

    it("returns expiring count", async () => {
      const result = await repo.list({ asOfDate: "2026-04-23" });
      expect(result.expiringCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("update", () => {
    it("updates item quantity", async () => {
      const added = await repo.add([{ name: "butter", quantity: 2, unit: "sticks", location: "fridge" }]);
      await repo.update([{ id: added[0].id, quantity: 1 }]);

      const result = await repo.list({ query: "butter" });
      expect(result.items[0].quantity).toBe(1);
    });

    it("updates item location", async () => {
      const added = await repo.add([{ name: "chicken", quantity: 2, unit: "lbs", location: "fridge" }]);
      await repo.update([{ id: added[0].id, location: "freezer" }]);

      const result = await repo.list({ query: "chicken" });
      expect(result.items[0].location).toBe("freezer");
    });
  });

  describe("remove", () => {
    it("removes items by id", async () => {
      const added = await repo.add([
        { name: "old item", location: "fridge" },
        { name: "keep this", location: "fridge" },
      ]);

      await repo.remove([added[0].id]);

      const result = await repo.list({});
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe("keep this");
    });
  });

  describe("findByName", () => {
    it("fuzzy matches inventory items by name", async () => {
      await repo.add([
        { name: "chicken thighs, boneless", category: "protein", quantity: 2, unit: "lbs", location: "fridge" },
        { name: "gochujang paste", category: "pantry", location: "pantry" },
      ]);

      const match = await repo.findByName("chicken thighs");
      expect(match).not.toBeNull();
      expect(match!.name).toContain("chicken");

      const match2 = await repo.findByName("gochujang");
      expect(match2).not.toBeNull();
      expect(match2!.name).toContain("gochujang");
    });

    it("returns null when no match", async () => {
      const match = await repo.findByName("truffle oil");
      expect(match).toBeNull();
    });
  });
});
