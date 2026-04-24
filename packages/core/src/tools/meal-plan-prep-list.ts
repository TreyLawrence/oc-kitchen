import { RecipeRepository } from "../repositories/recipe.repo.js";
import { MealPlanRepository } from "../repositories/meal-plan.repo.js";
import { UserProfileRepository } from "../repositories/user-profile.repo.js";

/**
 * Generates a prep list for a household helper.
 * Supports single-recipe mode (recipeId) or meal-plan day mode (mealPlanId + dayOfWeek).
 * The agent reads the recipe(s) and extracts prep-only tasks using its own intelligence.
 */
export function createGeneratePrepListTool(
  recipeRepo: RecipeRepository,
  mealPlanRepo: MealPlanRepository,
  profileRepo: UserProfileRepository,
) {
  return {
    name: "generate_prep_list",
    description:
      "Generate a prep handoff list for a household helper (nanny, partner). Pass recipeId for a single recipe, or mealPlanId + dayOfWeek to get all recipes for a meal plan day. Extracts chopping, measuring, marinating tasks — nothing that requires cooking knowledge.",
    parameters: {
      type: "object",
      properties: {
        recipeId: { type: "string", description: "Recipe ID (single-recipe mode)" },
        mealPlanId: { type: "string", description: "Meal plan ID (meal-plan day mode)" },
        dayOfWeek: { type: "number", description: "Day of week 0=Mon..6=Sun (required with mealPlanId)" },
        helperName: { type: "string", description: "Helper's name for personalized messaging" },
      },
    },
    handler: async (params: any, { respond }: any) => {
      try {
        // Validate: need recipeId or (mealPlanId + dayOfWeek)
        if (!params.recipeId && !params.mealPlanId) {
          respond(false, { ok: false, error: "Either recipeId or mealPlanId + dayOfWeek is required" });
          return;
        }
        if (params.mealPlanId && params.dayOfWeek === undefined) {
          respond(false, { ok: false, error: "dayOfWeek is required when using mealPlanId" });
          return;
        }

        // Fetch household context
        const householdSize = (await profileRepo.getPreference("household_size") as number) ?? 2;
        const dinnerTargetTime = (await profileRepo.getPreference("dinner_target_time") as string) ?? "19:30";
        const helpers = (await profileRepo.getPreference("helpers") as string[]) ?? [];
        const household = { householdSize, dinnerTargetTime, helpers };

        // Resolve helper name: param → first preference → default
        const helperName = params.helperName || helpers[0] || "your helper";
        const helperDisplay = helperName === "your helper" ? "the helper" : helperName;

        if (params.recipeId) {
          // Single-recipe mode
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
            household,
            helperName,
            instructions:
              `Read this recipe and extract ONLY prep tasks that don't require cooking knowledge or heat: chopping, dicing, peeling, measuring ingredients into bowls, mixing sauces/marinades, patting meat dry. Write them as simple standalone instructions anyone can follow. Estimate total prep time. Dinner target is ${dinnerTargetTime}. Format as a friendly message to ${helperDisplay}: "Hey [name]! When you get a chance, could you do this quick prep for tonight's dinner?"`,
          });
        } else {
          // Meal-plan day mode
          const plan = await mealPlanRepo.getById(params.mealPlanId);
          if (!plan) {
            respond(false, { ok: false, error: "Meal plan not found" });
            return;
          }

          // Filter entries for the requested day that have a recipe
          const dayEntries = plan.entries.filter(
            (e: any) => e.dayOfWeek === params.dayOfWeek && e.recipeId
          );

          if (dayEntries.length === 0) {
            respond(false, { ok: false, error: "No recipes found for that day" });
            return;
          }

          // Fetch full recipe for each entry
          const recipes = [];
          for (const entry of dayEntries) {
            const recipe = await recipeRepo.getById(entry.recipeId);
            if (recipe) {
              recipes.push({
                title: recipe.title,
                ingredients: recipe.ingredients,
                instructions: recipe.instructions,
                prepMinutes: recipe.prepMinutes,
                entryCategory: entry.category,
              });
            }
          }

          if (recipes.length === 0) {
            respond(false, { ok: false, error: "No recipes found for that day" });
            return;
          }

          respond(true, {
            ok: true,
            action: "generate_prep_list",
            recipes,
            household,
            helperName,
            instructions:
              `Read these recipes and extract ONLY prep tasks that don't require cooking knowledge or heat: chopping, dicing, peeling, measuring ingredients into bowls, mixing sauces/marinades, patting meat dry. When multiple recipes share prep (e.g. both need diced onion), combine into a single task. Write them as simple standalone instructions anyone can follow. Estimate total prep time across all recipes. Dinner target is ${dinnerTargetTime}. Format as a friendly message to ${helperDisplay}: "Hey [name]! When you get a chance, could you do this quick prep for tonight's dinner?"`,
          });
        }
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
