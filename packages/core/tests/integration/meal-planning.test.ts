import { describe, it, expect, beforeEach } from "vitest";
import { createIntegrationHarness, type IntegrationHarness } from "./helpers/harness.js";
import { seedFixtures } from "./helpers/fixtures.js";

describe("meal planning workflow", () => {
  let h: IntegrationHarness;

  beforeEach(() => {
    h = createIntegrationHarness();
  });

  describe("create and retrieve a meal plan", () => {
    it("creates a meal plan and retrieves it by ID", async () => {
      const createResult = await h.call("create_meal_plan", {
        name: "Week of Apr 28",
        weekStart: "2025-04-28",
        weekEnd: "2025-05-04",
        entries: [],
      });

      expect(createResult.success).toBe(true);
      expect(createResult.data.ok).toBe(true);
      expect(createResult.data.plan.id).toBeTruthy();
      expect(createResult.data.plan.name).toBe("Week of Apr 28");
      expect(createResult.data.plan.weekStart).toBe("2025-04-28");
      expect(createResult.data.plan.weekEnd).toBe("2025-05-04");
      expect(createResult.data.plan.status).toBe("draft");

      // Retrieve by ID
      const getResult = await h.call("get_meal_plan", {
        id: createResult.data.plan.id,
      });

      expect(getResult.success).toBe(true);
      expect(getResult.data.ok).toBe(true);
      expect(getResult.data.plan.name).toBe("Week of Apr 28");
      expect(getResult.data.plan.entries).toEqual([]);
    });

    it("creates a meal plan with entries inline", async () => {
      const { recipeIds } = await seedFixtures(h);

      const createResult = await h.call("create_meal_plan", {
        name: "Week of May 5",
        weekStart: "2025-05-05",
        weekEnd: "2025-05-11",
        entries: [
          {
            dayOfWeek: 0,
            mealType: "dinner",
            recipeId: recipeIds.sheetPanChicken,
            category: "exploit",
          },
          {
            dayOfWeek: 2,
            mealType: "dinner",
            recipeId: recipeIds.mapoTofu,
            category: "explore",
          },
        ],
      });

      expect(createResult.success).toBe(true);
      expect(createResult.data.plan.id).toBeTruthy();

      const getResult = await h.call("get_meal_plan", {
        id: createResult.data.plan.id,
      });

      expect(getResult.data.plan.entries).toHaveLength(2);
      expect(getResult.data.plan.entries[0].recipeId).toBe(recipeIds.sheetPanChicken);
      expect(getResult.data.plan.entries[0].dayOfWeek).toBe(0);
      expect(getResult.data.plan.entries[0].mealType).toBe("dinner");
      expect(getResult.data.plan.entries[0].category).toBe("exploit");
      expect(getResult.data.plan.entries[1].recipeId).toBe(recipeIds.mapoTofu);
      expect(getResult.data.plan.entries[1].category).toBe("explore");
    });
  });

  describe("update meal plan — add entries", () => {
    it("adds entries to an existing meal plan via update_meal_plan", async () => {
      const { recipeIds } = await seedFixtures(h);

      // Create empty plan
      const createResult = await h.call("create_meal_plan", {
        name: "Week of May 12",
        weekStart: "2025-05-12",
        weekEnd: "2025-05-18",
        entries: [],
      });
      const planId = createResult.data.plan.id;

      // Add entries
      const updateResult = await h.call("update_meal_plan", {
        id: planId,
        addEntries: [
          {
            dayOfWeek: 1,
            mealType: "dinner",
            recipeId: recipeIds.risotto,
            category: "exploit",
          },
          {
            dayOfWeek: 3,
            mealType: "dinner",
            recipeId: recipeIds.instantPotChili,
            category: "exploit",
          },
        ],
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data.ok).toBe(true);
      expect(updateResult.data.plan.entries).toHaveLength(2);

      const entries = updateResult.data.plan.entries;
      const tuesdayEntry = entries.find((e: any) => e.dayOfWeek === 1);
      const thursdayEntry = entries.find((e: any) => e.dayOfWeek === 3);
      expect(tuesdayEntry.recipeId).toBe(recipeIds.risotto);
      expect(thursdayEntry.recipeId).toBe(recipeIds.instantPotChili);
    });

    it("updates plan status from draft to active", async () => {
      const createResult = await h.call("create_meal_plan", {
        name: "Week of May 19",
        weekStart: "2025-05-19",
        weekEnd: "2025-05-25",
        entries: [],
      });

      const updateResult = await h.call("update_meal_plan", {
        id: createResult.data.plan.id,
        status: "active",
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data.plan.status).toBe("active");
    });

    it("removes entries from a meal plan", async () => {
      const { recipeIds } = await seedFixtures(h);

      const createResult = await h.call("create_meal_plan", {
        name: "Removal Test",
        weekStart: "2025-06-02",
        weekEnd: "2025-06-08",
        entries: [
          { dayOfWeek: 0, mealType: "dinner", recipeId: recipeIds.mapoTofu },
          { dayOfWeek: 2, mealType: "dinner", recipeId: recipeIds.risotto },
        ],
      });

      const planId = createResult.data.plan.id;
      const plan = await h.call("get_meal_plan", { id: planId });
      const entryToRemove = plan.data.plan.entries[0].id;

      const updateResult = await h.call("update_meal_plan", {
        id: planId,
        removeEntries: [entryToRemove],
      });

      expect(updateResult.data.plan.entries).toHaveLength(1);
      expect(updateResult.data.plan.entries[0].recipeId).toBe(recipeIds.risotto);
    });
  });

  describe("suggest meal plan", () => {
    it("returns context for the agent to build a meal plan", async () => {
      const { recipeIds } = await seedFixtures(h);

      const result = await h.call("suggest_meal_plan", {
        weekStart: "2025-05-05",
        cookingNights: [
          { dayOfWeek: 0, availableMinutes: 60 },
          { dayOfWeek: 2, availableMinutes: 45 },
          { dayOfWeek: 4, availableMinutes: 90 },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.data.ok).toBe(true);
      expect(result.data.action).toBe("build_meal_plan");

      // Verify context shape
      const ctx = result.data.context;
      expect(ctx).toBeTruthy();

      // Profile context
      expect(ctx.profile).toBeTruthy();
      expect(ctx.profile.equipment).toBeInstanceOf(Array);
      expect(ctx.profile.equipment.length).toBeGreaterThan(0);
      expect(ctx.profile.preferences).toBeTruthy();
      expect(typeof ctx.profile.exploreRatio).toBe("number");
      expect(typeof ctx.profile.householdSize).toBe("number");

      // Recipe library context
      expect(ctx.recipeLibrary).toBeTruthy();
      expect(ctx.recipeLibrary.bangers).toBeInstanceOf(Array);
      expect(ctx.recipeLibrary.makeAgains).toBeInstanceOf(Array);
      expect(ctx.recipeLibrary.tweaks).toBeInstanceOf(Array);
      expect(typeof ctx.recipeLibrary.uncookedCount).toBe("number");
      // All seeded recipes are uncooked (no cook log entries)
      expect(ctx.recipeLibrary.uncookedCount).toBeGreaterThanOrEqual(5);

      // Inventory context
      expect(ctx.inventory).toBeTruthy();
      expect(ctx.inventory.expiringItems).toBeInstanceOf(Array);
      expect(ctx.inventory.leftovers).toBeInstanceOf(Array);

      // Constraints and cooking nights passed through
      expect(ctx.cookingNights).toHaveLength(3);
      expect(ctx.constraints).toEqual({});

      // Instructions string for the agent
      expect(result.data.instructions).toBeTruthy();
      expect(result.data.instructions).toContain("2025-05-05");
    });

    it("passes constraints through to context", async () => {
      await seedFixtures(h);

      const result = await h.call("suggest_meal_plan", {
        weekStart: "2025-05-05",
        constraints: {
          preferCuisines: ["italian"],
          quickWeeknight: true,
        },
      });

      expect(result.success).toBe(true);
      expect(result.data.context.constraints.preferCuisines).toEqual(["italian"]);
      expect(result.data.context.constraints.quickWeeknight).toBe(true);
    });
  });

  describe("generate prep list", () => {
    it("generates a prep list for a single recipe", async () => {
      const { recipeIds } = await seedFixtures(h);

      const result = await h.call("generate_prep_list", {
        recipeId: recipeIds.mapoTofu,
        helperName: "Sarah",
      });

      expect(result.success).toBe(true);
      expect(result.data.ok).toBe(true);
      expect(result.data.action).toBe("generate_prep_list");
      expect(result.data.recipe.title).toBe("Mapo Tofu");
      expect(result.data.recipe.ingredients).toBeInstanceOf(Array);
      expect(result.data.recipe.ingredients.length).toBeGreaterThan(0);
      expect(result.data.recipe.instructions).toBeTruthy();
      expect(result.data.helperName).toBe("Sarah");
      expect(result.data.household).toBeTruthy();
      expect(result.data.instructions).toContain("Sarah");
    });

    it("generates a prep list for a meal plan day", async () => {
      const { recipeIds } = await seedFixtures(h);

      // Create a plan with entries on Monday
      const createResult = await h.call("create_meal_plan", {
        name: "Prep Test Week",
        weekStart: "2025-05-05",
        weekEnd: "2025-05-11",
        entries: [
          { dayOfWeek: 0, mealType: "lunch", recipeId: recipeIds.sheetPanChicken },
          { dayOfWeek: 0, mealType: "dinner", recipeId: recipeIds.risotto },
          { dayOfWeek: 2, mealType: "dinner", recipeId: recipeIds.mapoTofu },
        ],
      });

      const result = await h.call("generate_prep_list", {
        mealPlanId: createResult.data.plan.id,
        dayOfWeek: 0,
      });

      expect(result.success).toBe(true);
      expect(result.data.ok).toBe(true);
      expect(result.data.action).toBe("generate_prep_list");
      // Should include both Monday recipes
      expect(result.data.recipes).toHaveLength(2);
      const titles = result.data.recipes.map((r: any) => r.title);
      expect(titles).toContain("Sheet Pan Chicken Thighs with Vegetables");
      expect(titles).toContain("Mushroom Risotto");
      expect(result.data.instructions).toBeTruthy();
    });

    it("errors when no recipeId or mealPlanId is provided", async () => {
      const result = await h.call("generate_prep_list", {});

      expect(result.success).toBe(false);
      expect(result.data.error).toContain("recipeId or mealPlanId");
    });

    it("errors when mealPlanId given without dayOfWeek", async () => {
      const result = await h.call("generate_prep_list", {
        mealPlanId: "some-id",
      });

      expect(result.success).toBe(false);
      expect(result.data.error).toContain("dayOfWeek");
    });

    it("errors for a nonexistent recipe", async () => {
      const result = await h.call("generate_prep_list", {
        recipeId: "nonexistent-recipe-id",
      });

      expect(result.success).toBe(false);
      expect(result.data.error).toContain("Recipe not found");
    });
  });

  describe("meal plan with multiple entries across days and slots", () => {
    it("stores entries for different days and meal types", async () => {
      const { recipeIds } = await seedFixtures(h);

      const createResult = await h.call("create_meal_plan", {
        name: "Full Week",
        weekStart: "2025-05-05",
        weekEnd: "2025-05-11",
        entries: [
          { dayOfWeek: 0, mealType: "dinner", recipeId: recipeIds.sheetPanChicken, category: "exploit" },
          { dayOfWeek: 1, mealType: "dinner", customTitle: "Leftover: Sheet Pan Chicken", category: "leftover" },
          { dayOfWeek: 2, mealType: "dinner", recipeId: recipeIds.mapoTofu, category: "explore" },
          { dayOfWeek: 3, mealType: "lunch", recipeId: recipeIds.instantPotChili, category: "exploit" },
          { dayOfWeek: 4, mealType: "dinner", recipeId: recipeIds.risotto, category: "exploit" },
          { dayOfWeek: 5, mealType: "dinner", recipeId: recipeIds.smokedPorkShoulder, category: "exploit" },
          { dayOfWeek: 5, mealType: "lunch", customTitle: "Takeout", category: "skip" },
        ],
      });

      expect(createResult.success).toBe(true);

      const getResult = await h.call("get_meal_plan", {
        id: createResult.data.plan.id,
      });

      const entries = getResult.data.plan.entries;
      expect(entries).toHaveLength(7);

      // Verify leftover entry has no recipeId but has customTitle
      const leftoverEntry = entries.find((e: any) => e.category === "leftover");
      expect(leftoverEntry).toBeTruthy();
      expect(leftoverEntry.customTitle).toBe("Leftover: Sheet Pan Chicken");
      expect(leftoverEntry.recipeId).toBeNull();

      // Verify skip entry
      const skipEntry = entries.find((e: any) => e.category === "skip");
      expect(skipEntry).toBeTruthy();
      expect(skipEntry.customTitle).toBe("Takeout");

      // Verify Saturday has two entries (lunch + dinner)
      const saturdayEntries = entries.filter((e: any) => e.dayOfWeek === 5);
      expect(saturdayEntries).toHaveLength(2);
    });
  });

  describe("error handling", () => {
    it("returns null plan for a nonexistent meal plan ID", async () => {
      const result = await h.call("get_meal_plan", {
        id: "nonexistent-plan-id",
      });

      expect(result.success).toBe(true);
      expect(result.data.ok).toBe(true);
      expect(result.data.plan).toBeNull();
      expect(result.data.message).toContain("No meal plan found");
    });

    it("lists all plans when no ID or current flag given", async () => {
      await h.call("create_meal_plan", {
        name: "Plan A",
        weekStart: "2025-05-05",
        weekEnd: "2025-05-11",
        entries: [],
      });
      await h.call("create_meal_plan", {
        name: "Plan B",
        weekStart: "2025-05-12",
        weekEnd: "2025-05-18",
        entries: [],
      });

      const result = await h.call("get_meal_plan", {});

      expect(result.success).toBe(true);
      expect(result.data.ok).toBe(true);
      expect(result.data.plans).toBeInstanceOf(Array);
      expect(result.data.plans).toHaveLength(2);
    });

    it("handles update on a nonexistent meal plan gracefully", async () => {
      const result = await h.call("update_meal_plan", {
        id: "nonexistent-plan-id",
        status: "active",
      });

      // The update runs (no-op on the plan row) then tries getById which returns null
      expect(result.success).toBe(true);
      expect(result.data.plan).toBeNull();
    });
  });
});
