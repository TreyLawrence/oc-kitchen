import { describe, it, expect } from "vitest";
import { RecipeImportService } from "../../src/services/recipe-import.service.js";

// Integration test — hits real URLs
// These tests are slower and depend on external sites being available

describe("RecipeImportService (live)", () => {
  it("imports from Bon Appetit (real URL)", async () => {
    const result = await RecipeImportService.fetchAndParse(
      "https://www.bonappetit.com/recipe/slow-roast-gochujang-chicken"
    );

    expect(result).not.toBeNull();
    expect(result!.parseMethod).toBe("json-ld");
    expect(result!.recipe.title).toBeTruthy();
    expect(result!.recipe.ingredients.length).toBeGreaterThan(0);
    expect(result!.recipe.instructions).toBeTruthy();

    console.log("Imported:", result!.recipe.title);
    console.log("Ingredients:", result!.recipe.ingredients.length);
    console.log("Prep:", result!.recipe.prepMinutes, "min");
    console.log("Cook:", result!.recipe.cookMinutes, "min");
  }, 15000);

  it("imports from Woks of Life (real URL)", async () => {
    const result = await RecipeImportService.fetchAndParse(
      "https://thewoksoflife.com/vegan-mapo-tofu/"
    );

    expect(result).not.toBeNull();
    expect(result!.parseMethod).toBe("json-ld");
    expect(result!.recipe.title).toBeTruthy();
    expect(result!.recipe.ingredients.length).toBeGreaterThan(0);

    console.log("Imported:", result!.recipe.title);
    console.log("Ingredients:", result!.recipe.ingredients.length);
  }, 15000);

  it("imports from NYT Cooking (real URL)", async () => {
    // NYT Cooking may require auth for full content, but JSON-LD is usually in the page
    const result = await RecipeImportService.fetchAndParse(
      "https://cooking.nytimes.com/recipes/1017937-chicken-roasted-on-bread-with-caramelized-lemon"
    );

    // NYT may block or require auth — if so, this is expected to fail gracefully
    if (result) {
      expect(result.parseMethod).toBe("json-ld");
      expect(result.recipe.title).toBeTruthy();
      console.log("Imported:", result.recipe.title);
    } else {
      console.log("NYT Cooking blocked or no JSON-LD found (may require auth)");
    }
  }, 15000);
});
