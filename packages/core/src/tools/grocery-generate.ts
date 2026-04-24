import { GroceryGenerationService } from "../services/grocery-generation.service.js";

export function createGenerateGroceryListTool(service: GroceryGenerationService) {
  return {
    name: "generate_grocery_list",
    description:
      "Generate a grocery list from a finalized meal plan. Aggregates recipe ingredients, subtracts inventory, and assigns items to stores (ButcherBox for proteins, Weee! for Asian specialty, Instacart for everything else).",
    parameters: {
      type: "object",
      properties: {
        mealPlanId: { type: "string", description: "Meal plan ID to generate from" },
        subtractInventory: { type: "boolean", description: "Subtract kitchen inventory (default: true)" },
      },
      required: ["mealPlanId"],
    },
    handler: async (params: any, { respond }: any) => {
      try {
        const result = await service.generateFromPlan(
          params.mealPlanId,
          params.subtractInventory ?? true,
        );
        respond(true, { ok: true, ...result });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
