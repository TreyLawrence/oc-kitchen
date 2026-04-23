import { RecipeRepository } from "../repositories/recipe.repo.js";

export function createGetRecipeTool(repo: RecipeRepository) {
  return {
    name: "get_recipe",
    description:
      "Get a single recipe with its full ingredients list and cook history",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Recipe ID" },
      },
      required: ["id"],
    },
    handler: async (params: any, { respond }: any) => {
      try {
        const recipe = await repo.getById(params.id);
        if (!recipe) {
          respond(false, { ok: false, error: "Recipe not found" });
          return;
        }
        respond(true, { ok: true, recipe });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
