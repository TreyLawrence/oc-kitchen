import { RecipeRepository } from "../repositories/recipe.repo.js";

export function createDeleteRecipeTool(repo: RecipeRepository) {
  return {
    name: "delete_recipe",
    description:
      "Delete a recipe. Ingredients are cascade-deleted. Meal plan entries referencing this recipe have their recipeId set to null.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Recipe ID" },
      },
      required: ["id"],
    },
    handler: async (params: any, { respond }: any) => {
      try {
        const deleted = await repo.delete(params.id);
        if (!deleted) {
          respond(false, { ok: false, error: "Recipe not found" });
          return;
        }
        respond(true, { ok: true });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
