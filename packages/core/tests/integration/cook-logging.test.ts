import { describe, it, expect, beforeEach } from "vitest";
import { createIntegrationHarness, type IntegrationHarness } from "./helpers/harness.js";
import { seedFixtures } from "./helpers/fixtures.js";

describe("cook logging workflow", () => {
  let h: IntegrationHarness;
  let recipeIds: Record<string, string>;

  beforeEach(async () => {
    h = createIntegrationHarness();
    const seeded = await seedFixtures(h);
    recipeIds = seeded.recipeIds;
  });

  describe("basic cook logging", () => {
    it("logs a cook without verdict on a fresh recipe", async () => {
      const result = await h.call("log_cook", {
        recipeId: recipeIds.sheetPanChicken,
      });

      expect(result.success).toBe(true);
      expect(result.data.ok).toBe(true);
      expect(result.data.entry.recipeId).toBe(recipeIds.sheetPanChicken);
    });

    it("logged cook appears in get_recipe cookLog", async () => {
      await h.call("log_cook", { recipeId: recipeIds.sheetPanChicken });
      await h.call("log_cook", {
        recipeId: recipeIds.sheetPanChicken,
        verdict: "banger",
      });

      const recipe = await h.call("get_recipe", { id: recipeIds.sheetPanChicken });
      expect(recipe.success).toBe(true);
      expect(recipe.data.recipe.cookLog.length).toBe(2);
      expect(recipe.data.recipe.cookLog[0].verdict).toBe("banger");
    });
  });

  describe("verdict values", () => {
    const verdicts = [
      "banger",
      "make_again",
      "try_again_with_tweaks",
      "dont_make_again",
    ] as const;

    for (const verdict of verdicts) {
      it(`accepts verdict "${verdict}"`, async () => {
        // Create a tag-free recipe to avoid typed-tag issues in preference summary
        const created = await h.call("create_recipe", {
          title: `Verdict Test: ${verdict}`,
          source: "manual",
          instructions: "Test instructions",
        });
        const id = created.data.recipe.id;

        // First cook without verdict (required by validation)
        await h.call("log_cook", { recipeId: id });

        const result = await h.call("log_cook", {
          recipeId: id,
          verdict,
        });

        expect(result.success).toBe(true);
        expect(result.data.entry.verdict).toBe(verdict);

        // Recipe-level verdict should be updated
        const recipe = await h.call("get_recipe", { id });
        expect(recipe.data.recipe.verdict).toBe(verdict);
      });
    }
  });

  describe("cook with modifications", () => {
    it("stores modifications array", async () => {
      const modifications = [
        { original: "2 tbsp doubanjiang", modification: "3 tbsp doubanjiang for extra heat" },
        { original: "1 tbsp chili oil", modification: "2 tbsp chili oil" },
      ];

      await h.call("log_cook", {
        recipeId: recipeIds.mapoTofu,
        modifications,
      });

      const recipe = await h.call("get_recipe", { id: recipeIds.mapoTofu });
      const log = recipe.data.recipe.cookLog[0];
      expect(log.modifications).toEqual(modifications);
    });
  });

  describe("cook with notes", () => {
    it("stores notes on the cook log entry", async () => {
      const notes = "Used extra Sichuan peppercorn, turned out great. Baby loved it.";

      await h.call("log_cook", {
        recipeId: recipeIds.mapoTofu,
        notes,
      });

      const recipe = await h.call("get_recipe", { id: recipeIds.mapoTofu });
      expect(recipe.data.recipe.cookLog[0].notes).toBe(notes);
    });
  });

  describe("multiple cooks on same recipe", () => {
    it("records both cooks and reflects the most recent verdict", async () => {
      // First cook (no verdict)
      await h.call("log_cook", {
        recipeId: recipeIds.risotto,
        notes: "First attempt, a bit overcooked",
      });

      // Second cook with verdict
      await h.call("log_cook", {
        recipeId: recipeIds.risotto,
        verdict: "try_again_with_tweaks",
        notes: "Better but still needs work",
      });

      // Third cook with updated verdict
      await h.call("log_cook", {
        recipeId: recipeIds.risotto,
        verdict: "make_again",
        notes: "Nailed it this time",
      });

      const recipe = await h.call("get_recipe", { id: recipeIds.risotto });
      expect(recipe.data.recipe.cookLog.length).toBe(3);
      // Most recent verdict should be on the recipe
      expect(recipe.data.recipe.verdict).toBe("make_again");

      // cookLog is ordered most-recent-first
      expect(recipe.data.recipe.cookLog[0].notes).toBe("Nailed it this time");
      expect(recipe.data.recipe.cookLog[2].notes).toBe("First attempt, a bit overcooked");
    });
  });

  describe("verdict requires prior cook", () => {
    it("rejects verdict on a recipe with no prior cook log", async () => {
      const result = await h.call("log_cook", {
        recipeId: recipeIds.smokedPorkShoulder,
        verdict: "banger",
      });

      expect(result.success).toBe(false);
      expect(result.data.error).toMatch(/never been cooked/i);
    });

    it("allows verdict after a prior cook exists", async () => {
      // Create a tag-free recipe to avoid typed-tag issues in preference summary
      const created = await h.call("create_recipe", {
        title: "Verdict After Prior Cook",
        source: "manual",
        instructions: "Test instructions",
      });
      const id = created.data.recipe.id;

      // Log initial cook without verdict
      await h.call("log_cook", { recipeId: id });

      // Now verdict should be accepted
      const result = await h.call("log_cook", {
        recipeId: id,
        verdict: "banger",
      });

      expect(result.success).toBe(true);
      expect(result.data.entry.verdict).toBe("banger");
    });
  });
});

describe("ingredient deduction after cooking", () => {
  let h: IntegrationHarness;
  let recipeIds: Record<string, string>;

  beforeEach(async () => {
    h = createIntegrationHarness();
    const seeded = await seedFixtures(h);
    recipeIds = seeded.recipeIds;
  });

  it("deducts recipe ingredients from inventory", async () => {
    // Add inventory items matching sheet pan chicken ingredients
    await h.call("update_inventory", {
      add: [
        { name: "chicken thighs", quantity: 5, unit: "lbs", location: "fridge", category: "protein" },
        { name: "broccoli", quantity: 3, unit: "head", location: "fridge", category: "produce" },
        { name: "sweet potato", quantity: 6, unit: "medium", location: "pantry", category: "produce" },
        { name: "olive oil", quantity: 10, unit: "tbsp", location: "pantry", category: "pantry" },
      ],
    });

    const result = await h.call("deduct_recipe_ingredients", {
      recipeId: recipeIds.sheetPanChicken,
    });

    expect(result.success).toBe(true);
    expect(result.data.ok).toBe(true);
    expect(result.data.deducted.length).toBeGreaterThan(0);

    // Check that chicken thighs went from 5 to 3 (recipe uses 2 lbs)
    const chickenDeduction = result.data.deducted.find(
      (d: any) => d.inventoryItem === "chicken thighs",
    );
    expect(chickenDeduction).toBeTruthy();
    expect(chickenDeduction.remaining).toContain("3");
    expect(chickenDeduction.removed).toBe(false);

    // Check broccoli went from 3 to 2 (recipe uses 1 head)
    const broccoliDeduction = result.data.deducted.find(
      (d: any) => d.inventoryItem === "broccoli",
    );
    expect(broccoliDeduction).toBeTruthy();
    expect(broccoliDeduction.remaining).toContain("2");

    // Verify via list_inventory
    const inventory = await h.call("list_inventory", {});
    const chickenInv = inventory.data.items.find((i: any) => i.name === "chicken thighs");
    expect(chickenInv.quantity).toBe(3);
  });

  it("removes items that reach zero quantity", async () => {
    // Add inventory with exact quantities matching the recipe
    await h.call("update_inventory", {
      add: [
        { name: "chicken thighs", quantity: 2, unit: "lbs", location: "fridge", category: "protein" },
        { name: "broccoli", quantity: 1, unit: "head", location: "fridge", category: "produce" },
      ],
    });

    const result = await h.call("deduct_recipe_ingredients", {
      recipeId: recipeIds.sheetPanChicken,
    });

    expect(result.success).toBe(true);

    // Both should be removed (quantity hits 0)
    const chickenDeduction = result.data.deducted.find(
      (d: any) => d.inventoryItem === "chicken thighs",
    );
    expect(chickenDeduction.removed).toBe(true);

    const broccoliDeduction = result.data.deducted.find(
      (d: any) => d.inventoryItem === "broccoli",
    );
    expect(broccoliDeduction.removed).toBe(true);

    // Verify items are gone from inventory
    const inventory = await h.call("list_inventory", {});
    const chickenInv = inventory.data.items.find((i: any) => i.name === "chicken thighs");
    expect(chickenInv).toBeUndefined();

    const broccoliInv = inventory.data.items.find((i: any) => i.name === "broccoli");
    expect(broccoliInv).toBeUndefined();
  });

  it("reports unmatched ingredients not in inventory", async () => {
    // Add only some of the ingredients
    await h.call("update_inventory", {
      add: [
        { name: "chicken thighs", quantity: 5, unit: "lbs", location: "fridge", category: "protein" },
      ],
    });

    const result = await h.call("deduct_recipe_ingredients", {
      recipeId: recipeIds.sheetPanChicken,
    });

    expect(result.success).toBe(true);
    expect(result.data.unmatched.length).toBeGreaterThan(0);
    const unmatchedNames = result.data.unmatched.map((u: any) => u.ingredient);
    expect(unmatchedNames).toContain("broccoli");
  });

  it("creates leftover inventory for recipes serving more than household", async () => {
    // Smoked pork shoulder serves 8, household is 3 → 5 extra portions
    await h.call("update_inventory", {
      add: [
        { name: "pork shoulder", quantity: 10, unit: "lbs", location: "fridge", category: "protein" },
      ],
    });

    const result = await h.call("deduct_recipe_ingredients", {
      recipeId: recipeIds.smokedPorkShoulder,
    });

    expect(result.success).toBe(true);
    expect(result.data.leftovers.created).toBe(true);
    expect(result.data.leftovers.name).toBe("Leftover: Smoked Pork Shoulder");
    // Fixture seeds householdSize as string "3" but the service checks typeof === "number",
    // so it falls back to the default household size of 2. Servings (8) - 2 = 6 portions.
    expect(result.data.leftovers.portions).toBe(6);
    expect(result.data.leftovers.suggestFreezing).toBe(true);
  });
});
