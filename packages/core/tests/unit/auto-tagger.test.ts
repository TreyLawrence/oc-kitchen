import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { UserProfileRepository } from "../../src/repositories/user-profile.repo.js";
import { AutoTaggerService } from "../../src/services/auto-tagger.service.js";

// Spec: specs/recipes/recipe-management.md — Rule 5: typed tag objects

interface TypedTag {
  tag: string;
  type: "duration" | "equipment" | "cuisine" | "seasonal" | "user";
}

describe("AutoTaggerService", () => {
  let profileRepo: UserProfileRepository;
  let tagger: AutoTaggerService;

  beforeEach(async () => {
    const { db } = createTestDb();
    profileRepo = new UserProfileRepository(db);
    tagger = new AutoTaggerService(profileRepo);
  });

  describe("typed tag format", () => {
    it("returns tag objects with tag and type fields", async () => {
      const tags = await tagger.generateTags({
        title: "Quick Eggs",
        instructions: "Scramble them",
        prepMinutes: 5,
        cookMinutes: 10,
      });
      expect(tags.length).toBeGreaterThan(0);
      for (const t of tags) {
        expect(t).toHaveProperty("tag");
        expect(t).toHaveProperty("type");
      }
    });
  });

  describe("duration tags", () => {
    it('tags "quick" with type "duration" for < 30 min total', async () => {
      const tags = await tagger.generateTags({
        title: "Fast Stir Fry",
        instructions: "Cook it",
        prepMinutes: 10,
        cookMinutes: 15,
      });
      expect(tags).toContainEqual({ tag: "quick", type: "duration" });
    });

    it('tags "weeknight" with type "duration" for 30-59 min total', async () => {
      const tags = await tagger.generateTags({
        title: "Chicken Dinner",
        instructions: "Cook it",
        prepMinutes: 20,
        cookMinutes: 30,
      });
      expect(tags).toContainEqual({ tag: "weeknight", type: "duration" });
      expect(tags).not.toContainEqual({ tag: "quick", type: "duration" });
    });

    it('tags "project" with type "duration" for 2+ hours', async () => {
      const tags = await tagger.generateTags({
        title: "Smoked Brisket",
        instructions: "Smoke it low and slow",
        prepMinutes: 30,
        cookMinutes: 480,
      });
      expect(tags).toContainEqual({ tag: "project", type: "duration" });
    });

    it("does not add duration tag for 60-119 min", async () => {
      const tags = await tagger.generateTags({
        title: "Braise",
        instructions: "Braise it",
        prepMinutes: 20,
        cookMinutes: 70,
      });
      const durationTags = tags.filter((t) => t.type === "duration");
      expect(durationTags).toHaveLength(0);
    });

    it("does not add duration tag when no times provided", async () => {
      const tags = await tagger.generateTags({
        title: "Mystery Dish",
        instructions: "Cook it",
      });
      const durationTags = tags.filter((t) => t.type === "duration");
      expect(durationTags).toHaveLength(0);
    });
  });

  describe("equipment tags", () => {
    it('tags equipment with type "equipment"', async () => {
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
      expect(tags).toContainEqual({ tag: "big green egg", type: "equipment" });
      expect(tags).not.toContainEqual({ tag: "wok", type: "equipment" });
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
      expect(tags).toContainEqual({ tag: "instant pot", type: "equipment" });
    });

    it("does not tag equipment the user doesn't own", async () => {
      const tags = await tagger.generateTags({
        title: "Wok Stir Fry",
        instructions: "Heat the wok",
        prepMinutes: 10,
        cookMinutes: 10,
      });
      const equipTags = tags.filter((t) => t.type === "equipment");
      expect(equipTags).toHaveLength(0);
    });
  });

  describe("user tag preservation", () => {
    it("preserves user-provided tags with type user and adds auto tags", async () => {
      const tags = await tagger.generateTags({
        title: "Quick Lunch",
        instructions: "Make it fast",
        prepMinutes: 5,
        cookMinutes: 10,
        tags: [
          { tag: "lunch", type: "user" },
          { tag: "meal-prep", type: "user" },
        ],
      });
      expect(tags).toContainEqual({ tag: "lunch", type: "user" });
      expect(tags).toContainEqual({ tag: "meal-prep", type: "user" });
      expect(tags).toContainEqual({ tag: "quick", type: "duration" });
    });

    it("replaces old auto-tags but keeps user tags on regeneration", async () => {
      // Simulate a recipe that had "quick" but timing changed to "project"
      const tags = await tagger.generateTags({
        title: "Now Slow Dish",
        instructions: "Low and slow",
        prepMinutes: 30,
        cookMinutes: 480,
        tags: [
          { tag: "date night", type: "user" },
          { tag: "quick", type: "duration" }, // stale auto-tag
        ],
      });
      expect(tags).toContainEqual({ tag: "date night", type: "user" });
      expect(tags).toContainEqual({ tag: "project", type: "duration" });
      expect(tags).not.toContainEqual({ tag: "quick", type: "duration" });
    });

    it("deduplicates tags by tag name within the same type", async () => {
      const tags = await tagger.generateTags({
        title: "Fast Dish",
        instructions: "Cook it",
        prepMinutes: 5,
        cookMinutes: 10,
        tags: [{ tag: "quick", type: "duration" }],
      });
      const quickTags = tags.filter((t) => t.tag === "quick");
      expect(quickTags).toHaveLength(1);
    });

    it("migrates plain string tags as user type", async () => {
      // Legacy format: plain strings should be treated as user tags
      const tags = await tagger.generateTags({
        title: "Quick Lunch",
        instructions: "Make it fast",
        prepMinutes: 5,
        cookMinutes: 10,
        tags: ["lunch", "meal-prep"] as any,
      });
      expect(tags).toContainEqual({ tag: "lunch", type: "user" });
      expect(tags).toContainEqual({ tag: "meal-prep", type: "user" });
      expect(tags).toContainEqual({ tag: "quick", type: "duration" });
    });
  });
});
