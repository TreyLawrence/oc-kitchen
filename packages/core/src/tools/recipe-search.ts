import { RecipeRepository } from "../repositories/recipe.repo.js";

export function createSearchRecipesTool(repo: RecipeRepository) {
  return {
    name: "search_recipes",
    description:
      "Search saved recipes by title, ingredient, tag, verdict, source, or favorite status",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text search across title and tags" },
        source: { type: "string", enum: ["manual", "imported", "ai_generated"] },
        verdict: { type: "string", enum: ["banger", "make_again", "try_again_with_tweaks"] },
        favorite: { type: "boolean" },
        tags: { type: "array", items: { type: "string" }, description: "Filter by tags" },
        limit: { type: "number", description: "Max results (default 20)" },
        offset: { type: "number", description: "Pagination offset" },
      },
    },
    handler: async (params: any, { respond }: any) => {
      try {
        const results = await repo.search(params);
        respond(true, { ok: true, ...results });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
