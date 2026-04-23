export interface ParsedRecipe {
  title: string;
  description: string | null;
  ingredients: string[];
  instructions: string;
  prepMinutes: number | null;
  cookMinutes: number | null;
  servings: number | null;
  imageUrl: string | null;
}

export type FetchAndParseResult =
  | { recipe: ParsedRecipe; parseMethod: "json-ld" }
  | { html: string; parseMethod: "llm" };

export class RecipeImportService {
  /**
   * Parse ISO 8601 duration (e.g., "PT1H30M") to minutes.
   */
  static parseDuration(duration: string | undefined): number | null {
    if (!duration) return null;
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (!match) return null;
    const hours = parseInt(match[1] || "0", 10);
    const minutes = parseInt(match[2] || "0", 10);
    return hours * 60 + minutes;
  }

  /**
   * Parse servings from recipeYield (e.g., "4 servings", "4", "Makes 6").
   */
  static parseServings(yield_: string | number | undefined): number | null {
    if (yield_ === undefined || yield_ === null) return null;
    if (typeof yield_ === "number") return yield_;
    const match = String(yield_).match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Extract instructions from various JSON-LD formats.
   */
  static parseInstructions(
    instructions: unknown
  ): string {
    if (typeof instructions === "string") return instructions;

    if (Array.isArray(instructions)) {
      return instructions
        .map((step: any, i: number) => {
          if (typeof step === "string") return `${i + 1}. ${step}`;
          if (step.text) return `${i + 1}. ${step.text}`;
          return null;
        })
        .filter(Boolean)
        .join("\n");
    }

    return "";
  }

  /**
   * Find a Recipe object in JSON-LD data (handles @graph, arrays, and direct objects).
   */
  static findRecipeInJsonLd(data: any): any | null {
    if (!data) return null;

    // Direct Recipe object
    if (data["@type"] === "Recipe") return data;

    // Array of types (e.g., ["Recipe", "HowTo"])
    if (Array.isArray(data["@type"]) && data["@type"].includes("Recipe"))
      return data;

    // @graph array
    if (data["@graph"] && Array.isArray(data["@graph"])) {
      for (const item of data["@graph"]) {
        const found = RecipeImportService.findRecipeInJsonLd(item);
        if (found) return found;
      }
    }

    // Top-level array
    if (Array.isArray(data)) {
      for (const item of data) {
        const found = RecipeImportService.findRecipeInJsonLd(item);
        if (found) return found;
      }
    }

    return null;
  }

  /**
   * Extract JSON-LD script tags from HTML and parse for schema.org/Recipe.
   */
  static parseJsonLd(html: string): ParsedRecipe | null {
    // Extract all JSON-LD script blocks
    const scriptRegex =
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;

    while ((match = scriptRegex.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        const recipe = RecipeImportService.findRecipeInJsonLd(data);

        if (recipe) {
          return {
            title: recipe.name || "Untitled Recipe",
            description: recipe.description || null,
            ingredients: recipe.recipeIngredient || [],
            instructions: RecipeImportService.parseInstructions(
              recipe.recipeInstructions
            ),
            prepMinutes: RecipeImportService.parseDuration(recipe.prepTime),
            cookMinutes: RecipeImportService.parseDuration(recipe.cookTime),
            servings: RecipeImportService.parseServings(recipe.recipeYield),
            imageUrl: typeof recipe.image === "string"
              ? recipe.image
              : recipe.image?.url || null,
          };
        }
      } catch {
        // Invalid JSON, try next script block
        continue;
      }
    }

    return null;
  }

  /**
   * Strip HTML to readable text content for LLM extraction.
   * Removes scripts, styles, nav, footer, and collapses whitespace.
   */
  static stripHtml(html: string): string {
    let text = html;

    // Remove script and style blocks entirely
    text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
    text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
    text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");

    // Remove nav, header, footer elements (likely not recipe content)
    text = text.replace(/<nav[\s\S]*?<\/nav>/gi, "");
    text = text.replace(/<footer[\s\S]*?<\/footer>/gi, "");

    // Remove HTML comments
    text = text.replace(/<!--[\s\S]*?-->/g, "");

    // Replace block-level tags with newlines
    text = text.replace(/<\/(p|div|li|h[1-6]|tr|br\s*\/?)>/gi, "\n");
    text = text.replace(/<br\s*\/?>/gi, "\n");

    // Remove remaining HTML tags
    text = text.replace(/<[^>]+>/g, " ");

    // Decode common HTML entities
    text = text.replace(/&amp;/g, "&");
    text = text.replace(/&lt;/g, "<");
    text = text.replace(/&gt;/g, ">");
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/&nbsp;/g, " ");
    text = text.replace(/&#x27;/g, "'");
    text = text.replace(/&frac12;/g, "½");
    text = text.replace(/&frac13;/g, "⅓");
    text = text.replace(/&frac14;/g, "¼");
    text = text.replace(/&frac34;/g, "¾");

    // Collapse whitespace: multiple spaces → single space, multiple newlines → double newline
    text = text.replace(/[ \t]+/g, " ");
    text = text.replace(/\n[ \t]+/g, "\n");
    text = text.replace(/\n{3,}/g, "\n\n");

    return text.trim();
  }

  /**
   * Fetch a URL and attempt to parse a recipe from it.
   * Returns the parsed recipe (JSON-LD) or stripped HTML for LLM extraction.
   */
  static async fetchAndParse(
    url: string
  ): Promise<FetchAndParseResult | null> {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; OCKitchen/1.0; recipe importer)",
        Accept: "text/html",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();

    // Try JSON-LD first
    const jsonLdResult = RecipeImportService.parseJsonLd(html);
    if (jsonLdResult) {
      return { recipe: jsonLdResult, parseMethod: "json-ld" };
    }

    // LLM fallback — strip HTML and return text for agent extraction
    const stripped = RecipeImportService.stripHtml(html);
    if (!stripped) {
      return null;
    }

    return { html: stripped, parseMethod: "llm" };
  }
}
