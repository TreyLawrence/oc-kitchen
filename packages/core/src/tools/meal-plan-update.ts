import { MealPlanRepository } from "../repositories/meal-plan.repo.js";

export function createUpdateMealPlanTool(repo: MealPlanRepository) {
  return {
    name: "update_meal_plan",
    description:
      "Modify a meal plan — change status, add/remove/swap entries.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Plan ID" },
        status: { type: "string", enum: ["draft", "active", "completed"] },
        notes: { type: "string" },
        addEntries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dayOfWeek: { type: "number" },
              mealType: { type: "string" },
              recipeId: { type: "string" },
              customTitle: { type: "string" },
              category: { type: "string" },
              dependsOn: { type: "string" },
            },
            required: ["dayOfWeek", "mealType"],
          },
        },
        removeEntries: { type: "array", items: { type: "string" }, description: "Entry IDs to remove" },
        updateEntries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              recipeId: { type: "string" },
              customTitle: { type: "string" },
              category: { type: "string" },
            },
            required: ["id"],
          },
        },
      },
      required: ["id"],
    },
    handler: async (params: any, { respond }: any) => {
      try {
        const { id, ...updates } = params;
        await repo.update(id, updates);
        const plan = await repo.getById(id);
        respond(true, { ok: true, plan });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
