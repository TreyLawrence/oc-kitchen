import { InventoryDeductionService } from "../services/inventory-deduction.service.js";

export function createDeductRecipeIngredientsTool(service: InventoryDeductionService) {
  return {
    name: "deduct_recipe_ingredients",
    description:
      "Automatically deduct a recipe's ingredients from kitchen inventory after cooking. Fuzzy-matches ingredient names, subtracts quantities, and removes items that reach zero.",
    parameters: {
      type: "object",
      properties: {
        recipeId: { type: "string", description: "Recipe ID to deduct ingredients for" },
      },
      required: ["recipeId"],
    },
    handler: async (params: any, { respond }: any) => {
      try {
        const result = await service.deductForRecipe(params.recipeId);
        respond(true, { ok: true, ...result });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
