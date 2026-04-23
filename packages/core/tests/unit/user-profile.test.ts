import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { userEquipment, userPreferences } from "../../src/db/schema.js";
import { UserProfileRepository } from "../../src/repositories/user-profile.repo.js";
import { eq } from "drizzle-orm";

// Spec: specs/shared/onboarding.md

describe("UserProfileRepository", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let repo: UserProfileRepository;

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    repo = new UserProfileRepository(db);
  });

  describe("equipment", () => {
    // Spec: "One row per piece of equipment"
    it("adds equipment items", async () => {
      await repo.addEquipment([
        { name: "Big Green Egg", category: "grill" },
        { name: "Instant Pot", category: "appliance" },
      ]);

      const items = await repo.listEquipment();
      expect(items).toHaveLength(2);
      expect(items.map((e) => e.name)).toContain("Big Green Egg");
      expect(items.map((e) => e.name)).toContain("Instant Pot");
    });

    it("removes equipment by id", async () => {
      await repo.addEquipment([{ name: "Old Grill", category: "grill" }]);
      const items = await repo.listEquipment();
      expect(items).toHaveLength(1);

      await repo.removeEquipment([items[0].id]);
      const after = await repo.listEquipment();
      expect(after).toHaveLength(0);
    });

    // Spec: "Equipment categories: grill, appliance, cookware, bakeware, outdoor, tool"
    it("stores equipment with category", async () => {
      await repo.addEquipment([
        { name: "Wok", category: "cookware" },
      ]);

      const items = await repo.listEquipment();
      expect(items[0].category).toBe("cookware");
    });
  });

  describe("preferences", () => {
    // Spec: "Key-value pairs in user_preferences table"
    it("sets and gets a preference", async () => {
      await repo.setPreference("cuisine_affinities", ["korean", "mexican", "italian"]);

      const value = await repo.getPreference("cuisine_affinities");
      expect(value).toEqual(["korean", "mexican", "italian"]);
    });

    it("updates an existing preference", async () => {
      await repo.setPreference("household_size", 2);
      await repo.setPreference("household_size", 4);

      const value = await repo.getPreference("household_size");
      expect(value).toBe(4);
    });

    it("returns null for unset preference", async () => {
      const value = await repo.getPreference("nonexistent_key");
      expect(value).toBeNull();
    });

    // Spec: "get_user_preferences returns full profile"
    it("gets all preferences as an object", async () => {
      await repo.setPreference("cuisine_affinities", ["korean"]);
      await repo.setPreference("household_size", 2);
      await repo.setPreference("adventurousness", "adventurous");

      const all = await repo.getAllPreferences();
      expect(all.cuisine_affinities).toEqual(["korean"]);
      expect(all.household_size).toBe(2);
      expect(all.adventurousness).toBe("adventurous");
    });

    // Spec: "favorite_sources stored in preferences"
    it("stores favorite recipe sources", async () => {
      await repo.setPreference("favorite_sources", [
        "bonappetit.com",
        "cooking.nytimes.com",
        "thewoksoflife.com",
      ]);

      const value = await repo.getPreference("favorite_sources");
      expect(value).toEqual([
        "bonappetit.com",
        "cooking.nytimes.com",
        "thewoksoflife.com",
      ]);
    });
  });

  describe("full profile", () => {
    // Spec: "get_user_preferences — Retrieve the full user profile"
    it("returns combined equipment and preferences", async () => {
      await repo.addEquipment([
        { name: "Big Green Egg", category: "grill" },
      ]);
      await repo.setPreference("cuisine_affinities", ["korean"]);
      await repo.setPreference("household_size", 2);

      const profile = await repo.getFullProfile();
      expect(profile.equipment).toHaveLength(1);
      expect(profile.equipment[0].name).toBe("Big Green Egg");
      expect(profile.preferences.cuisine_affinities).toEqual(["korean"]);
      expect(profile.preferences.household_size).toBe(2);
    });

    // Spec: "Onboarding triggers automatically when get_user_preferences returns empty"
    it("returns empty profile for new user", async () => {
      const profile = await repo.getFullProfile();
      expect(profile.equipment).toHaveLength(0);
      expect(Object.keys(profile.preferences)).toHaveLength(0);
    });
  });
});
