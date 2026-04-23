import { describe, it, expect, beforeEach, vi } from "vitest";
import { RecipeImportService } from "../../src/services/recipe-import.service.js";
import { createTestDb } from "../../src/db/index.js";
import { RecipeRepository } from "../../src/repositories/recipe.repo.js";
import { createSaveImportedRecipeTool } from "../../src/tools/recipe-import-save.js";

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

  describe("stripHtml", () => {
    it("removes script and style blocks", () => {
      const html = `<html><head><style>body { color: red; }</style></head>
        <body><script>alert('hi')</script><p>Hello world</p></body></html>`;
      const result = RecipeImportService.stripHtml(html);
      expect(result).not.toContain("alert");
      expect(result).not.toContain("color: red");
      expect(result).toContain("Hello world");
    });

    it("removes nav and footer elements", () => {
      const html = `<nav><a href="/">Home</a></nav>
        <main><p>Recipe content here</p></main>
        <footer><p>Copyright 2026</p></footer>`;
      const result = RecipeImportService.stripHtml(html);
      expect(result).not.toContain("Home");
      expect(result).not.toContain("Copyright");
      expect(result).toContain("Recipe content here");
    });

    it("decodes HTML entities", () => {
      const html = "<p>1 &amp; 2 &lt; 3 &frac12; cup &frac14; tsp</p>";
      const result = RecipeImportService.stripHtml(html);
      expect(result).toContain("1 & 2 < 3 ½ cup ¼ tsp");
    });

    it("collapses excessive whitespace", () => {
      const html = "<p>Line one</p>\n\n\n\n\n<p>Line two</p>";
      const result = RecipeImportService.stripHtml(html);
      // Should have at most double newlines
      expect(result).not.toMatch(/\n{3,}/);
    });

    it("returns empty string for empty/whitespace-only content", () => {
      const html = "<html><head><style>x{}</style></head><body>  </body></html>";
      const result = RecipeImportService.stripHtml(html);
      expect(result).toBe("");
    });
  });
});

describe("save_imported_recipe tool", () => {
  let recipeRepo: RecipeRepository;
  let tool: ReturnType<typeof createSaveImportedRecipeTool>;

  beforeEach(() => {
    const { db } = createTestDb();
    recipeRepo = new RecipeRepository(db);
    tool = createSaveImportedRecipeTool(recipeRepo);
  });

  it("saves an LLM-extracted recipe with source imported and sourceUrl", async () => {
    const respond = vi.fn();
    await tool.handler(
      {
        url: "https://www.bonappetit.com/recipe/gochujang-chicken",
        title: "Gochujang Chicken",
        description: "Spicy-sweet roasted chicken",
        servings: 4,
        prepMinutes: 15,
        cookMinutes: 40,
        instructions: "## Steps\n1. Marinate\n2. Roast at 425F",
        ingredients: [
          { name: "chicken thighs", quantity: 2, unit: "lbs", category: "protein" },
          { name: "gochujang", quantity: 3, unit: "tbsp", category: "pantry" },
        ],
        tags: ["korean", "weeknight"],
      },
      { respond }
    );

    expect(respond).toHaveBeenCalledWith(true, expect.objectContaining({ ok: true }));
    const result = respond.mock.calls[0][1];
    expect(result.recipe.title).toBe("Gochujang Chicken");
    expect(result.recipe.source).toBe("imported");
    expect(result.recipe.sourceUrl).toBe("https://www.bonappetit.com/recipe/gochujang-chicken");
    expect(result.parseMethod).toBe("llm");
  });

  it("requires url, title, and instructions", async () => {
    const respond = vi.fn();
    await tool.handler(
      { url: "https://example.com", title: "Test" },
      { respond }
    );

    // Should fail due to missing instructions (repo requires it)
    expect(respond).toHaveBeenCalledWith(false, expect.objectContaining({ ok: false }));
  });
});
