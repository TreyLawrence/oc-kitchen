import { MealPlanRepository } from "../repositories/meal-plan.repo.js";

export function createGetMealPlanTool(repo: MealPlanRepository) {
  return {
    name: "get_meal_plan",
    description:
      "Get a meal plan with all entries and recipe details. Can fetch by ID or get the current active plan.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Plan ID" },
        current: { type: "boolean", description: "Get the active plan for this week" },
      },
    },
    handler: async (params: any, { respond }: any) => {
      try {
        let plan;
        if (params.current) {
          plan = await repo.getCurrent();
        } else if (params.id) {
          plan = await repo.getById(params.id);
        } else {
          const plans = await repo.list();
          respond(true, { ok: true, plans });
          return;
        }

        if (!plan) {
          respond(true, { ok: true, plan: null, message: "No meal plan found" });
          return;
        }
        respond(true, { ok: true, plan });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
