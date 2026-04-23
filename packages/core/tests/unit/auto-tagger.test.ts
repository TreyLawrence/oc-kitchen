import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { UserProfileRepository } from "../../src/repositories/user-profile.repo.js";
import { AutoTaggerService } from "../../src/services/auto-tagger.service.js";

// Spec: specs/recipes/recipe-management.md — Rule 5: auto-derived tags

describe("AutoTaggerService", () => {
  let profileRepo: UserProfileRepository;
  let tagger: AutoTaggerService;

  beforeEach(async () => {
    const { db } = createTestDb();
    profileRepo = new UserProfileRepository(db);
    tagger = new AutoTaggerService(profileRepo);
  });

  describe("duration tags", () => {
    it('tags "quick" for < 30 min total', async () => {
      const tags = await tagger.generateTags({
        title: "Fast Stir Fry",
        instructions: "Cook it",
        prepMinutes: 10,
        cookMinutes: 15,
      });
      expect(tags).toContain("quick");
    });

    it('tags "weeknight" for 30-59 min total', async () => {
      const tags = await tagger.generateTags({
        title: "Chicken Dinner",
        instructions: "Cook it",
        prepMinutes: 20,
        cookMinutes: 30,
      });
      expect(tags).toContain("weeknight");
      expect(tags).not.toContain("quick");
    });

    it('tags "project" for 2+ hours', async () => {
      const tags = await tagger.generateTags({
        title: "Smoked Brisket",
        instructions: "Smoke it low and slow",
        prepMinutes: 30,
        cookMinutes: 480,
      });
      expect(tags).toContain("project");
    });

    it("does not add duration tag for 60-119 min", async () => {
      const tags = await tagger.generateTags({
        title: "Braise",
        instructions: "Braise it",
        prepMinutes: 20,
        cookMinutes: 70,
      });
      expect(tags).not.toContain("quick");
      expect(tags).not.toContain("weeknight");
      expect(tags).not.toContain("project");
    });

    it("does not add duration tag when no times provided", async () => {
      const tags = await tagger.generateTags({
        title: "Mystery Dish",
        instructions: "Cook it",
      });
      expect(tags).not.toContain("quick");
      expect(tags).not.toContain("weeknight");
      expect(tags).not.toContain("project");
    });
  });

  describe("equipment tags", () => {
    it("tags equipment mentioned in title or instructions", async () => {
      await profileRepo.addEquipment([
        { name: "Big Green Egg", category: "grill" },
        { name: "Wok", category: "cookware" },
      ]);

      const tags = await tagger.generateTags({
        title: "Big Green Egg Smoked Chicken",
        instructions: "Fire up the Big Green Egg and smoke the chicken",
        prepMinutes: 20,
        cookMinutes: 180,
      });
      expect(tags).toContain("big green egg");
      expect(tags).not.toContain("wok");
    });

    it("matches equipment in instructions even if not in title", async () => {
      await profileRepo.addEquipment([
        { name: "Instant Pot", category: "appliance" },
      ]);

      const tags = await tagger.generateTags({
        title: "Chicken Curry",
        instructions: "Set the Instant Pot to pressure cook for 15 minutes",
        prepMinutes: 10,
        cookMinutes: 15,
      });
      expect(tags).toContain("instant pot");
    });

    it("does not tag equipment the user doesn't own", async () => {
      // No equipment added
      const tags = await tagger.generateTags({
        title: "Wok Stir Fry",
        instructions: "Heat the wok",
        prepMinutes: 10,
        cookMinutes: 10,
      });
      // No equipment match since user has none
      expect(tags).not.toContain("wok");
    });
  });

  describe("user tags preserved", () => {
    it("preserves user-provided tags and adds auto tags", async () => {
      const tags = await tagger.generateTags({
        title: "Quick Lunch",
        instructions: "Make it fast",
        prepMinutes: 5,
        cookMinutes: 10,
        tags: ["lunch", "meal-prep"],
      });
      expect(tags).toContain("lunch");
      expect(tags).toContain("meal-prep");
      expect(tags).toContain("quick");
    });

    it("deduplicates if user already added a duration tag", async () => {
      const tags = await tagger.generateTags({
        title: "Fast Dish",
        instructions: "Cook it",
        prepMinutes: 5,
        cookMinutes: 10,
        tags: ["quick"],
      });
      const quickCount = tags.filter((t) => t === "quick").length;
      expect(quickCount).toBe(1);
    });
  });
});
