import { MealPlanRepository } from "../repositories/meal-plan.repo.js";

export function createCreateMealPlanTool(repo: MealPlanRepository) {
  return {
    name: "create_meal_plan",
    description:
      "Save a weekly meal plan to the database. Usually called after the user approves a suggested plan.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: 'Plan name (e.g., "Week of Apr 27")' },
        weekStart: { type: "string", description: "Monday date (YYYY-MM-DD)" },
        weekEnd: { type: "string", description: "Sunday date (YYYY-MM-DD)" },
        status: { type: "string", enum: ["draft", "active"], description: "Plan status (default: draft)" },
        entries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dayOfWeek: { type: "number", description: "0=Monday through 6=Sunday" },
              mealType: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
              recipeId: { type: "string", description: "Recipe ID (null for leftovers/takeout)" },
              customTitle: { type: "string", description: 'For non-recipe entries ("Leftover: Gochujang Chicken", "Takeout")' },
              category: { type: "string", enum: ["exploit", "explore", "leftover", "prep", "skip"] },
              dependsOn: { type: "string", description: "Recipe ID this entry depends on (prep → cook)" },
            },
            required: ["dayOfWeek", "mealType"],
          },
        },
      },
      required: ["name", "weekStart", "weekEnd", "entries"],
    },
    handler: async (params: any, { respond }: any) => {
      try {
        const plan = await repo.create(params);
        respond(true, { ok: true, plan });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
