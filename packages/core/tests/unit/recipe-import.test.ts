import { describe, it, expect, beforeEach } from "vitest";
import { RecipeImportService } from "../../src/services/recipe-import.service.js";

// Spec: specs/recipes/recipe-management.md — import_recipe tool
// Spec: Design Decision 2 — "Hybrid: JSON-LD first, LLM fallback"

describe("RecipeImportService", () => {
  describe("parseJsonLd", () => {
    // Spec: "extract JSON-LD schema.org/Recipe structured data first"
    it("extracts recipe from JSON-LD in HTML", () => {
      const html = `
        <html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Recipe",
            "name": "Gochujang Chicken",
            "description": "Spicy-sweet roasted chicken",
            "recipeIngredient": [
              "2 lbs chicken thighs",
              "3 tbsp gochujang",
              "1 tbsp soy sauce"
            ],
            "recipeInstructions": [
              {"@type": "HowToStep", "text": "Marinate the chicken"},
              {"@type": "HowToStep", "text": "Roast at 425F for 40 min"}
            ],
            "prepTime": "PT15M",
            "cookTime": "PT40M",
            "recipeYield": "4 servings"
          }
          </script>
        </head>
        <body></body>
        </html>
      `;

      const result = RecipeImportService.parseJsonLd(html);
      expect(result).not.toBeNull();
      expect(result!.title).toBe("Gochujang Chicken");
      expect(result!.description).toBe("Spicy-sweet roasted chicken");
      expect(result!.ingredients).toHaveLength(3);
      expect(result!.ingredients[0]).toContain("chicken thighs");
      expect(result!.prepMinutes).toBe(15);
      expect(result!.cookMinutes).toBe(40);
      expect(result!.servings).toBe(4);
    });

    it("extracts from nested @graph JSON-LD", () => {
      const html = `
        <html><head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "WebPage", "name": "Some Page" },
            {
              "@type": "Recipe",
              "name": "Mapo Tofu",
              "recipeIngredient": ["1 block tofu", "2 tbsp doubanjiang"],
              "recipeInstructions": "Cook the tofu with the sauce."
            }
          ]
        }
        </script>
        </head><body></body></html>
      `;

      const result = RecipeImportService.parseJsonLd(html);
      expect(result).not.toBeNull();
      expect(result!.title).toBe("Mapo Tofu");
      expect(result!.ingredients).toHaveLength(2);
    });

    it("returns null when no JSON-LD found", () => {
      const html = "<html><head></head><body><h1>Not a recipe</h1></body></html>";
      const result = RecipeImportService.parseJsonLd(html);
      expect(result).toBeNull();
    });

    it("returns null when JSON-LD has no Recipe type", () => {
      const html = `
        <html><head>
        <script type="application/ld+json">
        { "@type": "Article", "name": "Blog Post" }
        </script>
        </head><body></body></html>
      `;
      const result = RecipeImportService.parseJsonLd(html);
      expect(result).toBeNull();
    });

    it("handles string recipeInstructions", () => {
      const html = `
        <html><head>
        <script type="application/ld+json">
        {
          "@type": "Recipe",
          "name": "Simple Dish",
          "recipeIngredient": ["1 egg"],
          "recipeInstructions": "Just cook the egg. Season to taste."
        }
        </script>
        </head><body></body></html>
      `;

      const result = RecipeImportService.parseJsonLd(html);
      expect(result).not.toBeNull();
      expect(result!.instructions).toContain("cook the egg");
    });

    it("parses ISO 8601 duration correctly", () => {
      const html = `
        <html><head>
        <script type="application/ld+json">
        {
          "@type": "Recipe",
          "name": "Slow Cook",
          "recipeIngredient": ["1 thing"],
          "recipeInstructions": "Cook it.",
          "prepTime": "PT1H30M",
          "cookTime": "PT2H"
        }
        </script>
        </head><body></body></html>
      `;

      const result = RecipeImportService.parseJsonLd(html);
      expect(result!.prepMinutes).toBe(90);
      expect(result!.cookMinutes).toBe(120);
    });
  });
});
