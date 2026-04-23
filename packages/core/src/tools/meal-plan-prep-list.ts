import { RecipeRepository } from "../repositories/recipe.repo.js";

/**
 * Generates a prep list for a household helper.
 * The agent reads the recipe and extracts prep-only tasks using its own intelligence.
 */
export function createGeneratePrepListTool(recipeRepo: RecipeRepository) {
  return {
    name: "generate_prep_list",
    description:
      "Generate a simple prep handoff list for a household helper (nanny, partner). Extracts chopping, measuring, marinating tasks from a recipe — nothing that requires cooking knowledge.",
    parameters: {
      type: "object",
      properties: {
        recipeId: { type: "string", description: "Recipe ID" },
        helperName: { type: "string", description: "Helper's name for personalized messaging" },
      },
      required: ["recipeId"],
    },
    handler: async (params: any, { respond }: any) => {
      try {
        const recipe = await recipeRepo.getById(params.recipeId);
        if (!recipe) {
          respond(false, { ok: false, error: "Recipe not found" });
          return;
        }

        respond(true, {
          ok: true,
          action: "generate_prep_list",
          recipe: {
            title: recipe.title,
            ingredients: recipe.ingredients,
            instructions: recipe.instructions,
            prepMinutes: recipe.prepMinutes,
          },
          helperName: params.helperName || "your helper",
          instructions:
            `Read this recipe and extract ONLY prep tasks that don't require cooking knowledge or heat: chopping, dicing, peeling, measuring ingredients into bowls, mixing sauces/marinades, patting meat dry. Write them as simple standalone instructions anyone can follow. Estimate total prep time. Format as a friendly message to ${params.helperName || "the helper"}: "Hey [name]! When you get a chance, could you do this quick prep for tonight's dinner?"`,
        });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
