import { RecipeRepository } from "../repositories/recipe.repo.js";
import { RecipeImportService } from "../services/recipe-import.service.js";

export function createImportRecipeTool(repo: RecipeRepository) {
  return {
    name: "import_recipe",
    description:
      "Import a recipe from a URL. Extracts structured data using JSON-LD (schema.org/Recipe) first, falls back to LLM parsing. Supports Bon Appetit, NYT Cooking, Woks of Life, and many other sites.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL of the recipe page" },
      },
      required: ["url"],
    },
    handler: async (params: any, { respond }: any) => {
      try {
        // Check for duplicate
        const existing = await repo.search({ query: params.url });
        const duplicate = existing.recipes.find(
          (r: any) => r.sourceUrl === params.url
        );
        if (duplicate) {
          respond(true, {
            ok: true,
            recipe: duplicate,
            parseMethod: "cached",
            warning: "This URL has already been imported",
          });
          return;
        }

        const result = await RecipeImportService.fetchAndParse(params.url);
        if (!result) {
          respond(false, {
            ok: false,
            error: "Could not parse recipe from this URL",
          });
          return;
        }

        const { recipe: parsed, parseMethod } = result;

        // Parse raw ingredient strings into structured data
        const ingredients = parsed.ingredients.map((raw: string) => {
          // Basic parsing: "2 lbs chicken thighs" → { quantity: 2, unit: "lbs", name: "chicken thighs" }
          const match = raw.match(
            /^([\d./½⅓¼¾⅔⅛]+)?\s*([a-zA-Z]+\.?)?\s+(.+)$/
          );
          if (match) {
            return {
              name: match[3].trim(),
              quantity: match[1] ? parseFloat(match[1]) : undefined,
              unit: match[2]?.replace(".", "") || undefined,
            };
          }
          return { name: raw };
        });

        const recipe = await repo.create({
          title: parsed.title,
          description: parsed.description ?? undefined,
          source: "imported",
          sourceUrl: params.url,
          instructions: parsed.instructions,
          prepMinutes: parsed.prepMinutes ?? undefined,
          cookMinutes: parsed.cookMinutes ?? undefined,
          servings: parsed.servings ?? undefined,
          imageUrl: parsed.imageUrl ?? undefined,
          ingredients,
        });

        respond(true, { ok: true, recipe, parseMethod });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
