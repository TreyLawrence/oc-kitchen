import { InventoryRepository } from "../repositories/inventory.repo.js";
import { MealPlanRepository } from "../repositories/meal-plan.repo.js";
import { RecipeRepository } from "../repositories/recipe.repo.js";

export function createVerifyInventoryTool(
  repo: InventoryRepository,
  mealPlanRepo?: MealPlanRepository,
  recipeRepo?: RecipeRepository,
) {
  return {
    name: "verify_inventory",
    description:
      "Pre-order inventory freshness check. Flags items that haven't been updated recently (perishables: 5+ days, pantry: 30+ days) so the agent can confirm with the user before generating a grocery list.",
    parameters: {
      type: "object",
      properties: {
        mealPlanId: { type: "string", description: "Optional — check items relevant to this meal plan" },
      },
    },
    handler: async (params: any, { respond }: any) => {
      try {
        const { confident, needsCheck } = await repo.getStaleItems();

        let filteredConfident = confident;
        let filteredNeedsCheck = needsCheck;

        if (params.mealPlanId && mealPlanRepo && recipeRepo) {
          const ingredientNames = await getIngredientNames(params.mealPlanId, mealPlanRepo, recipeRepo);
          if (ingredientNames.size > 0) {
            const isRelevant = (item: any) => {
              const nameLower = item.name.toLowerCase();
              for (const ing of ingredientNames) {
                if (nameLower.includes(ing) || ing.includes(nameLower)) return true;
              }
              return false;
            };
            filteredConfident = confident.filter(isRelevant);
            filteredNeedsCheck = needsCheck.filter(isRelevant);
          }
        }

        let question = "";
        if (filteredNeedsCheck.length > 0) {
          const itemNames = filteredNeedsCheck.map((i: any) => {
            const loc = i.location ? ` in the ${i.location}` : "";
            return `${i.name}${loc}`;
          });
          question = `Before I generate your grocery list, can you confirm: do you still have ${itemNames.join(", ")}?`;
        }

        respond(true, {
          ok: true,
          confident: filteredConfident,
          needsCheck: filteredNeedsCheck,
          question,
          allFresh: filteredNeedsCheck.length === 0,
        });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}

async function getIngredientNames(
  mealPlanId: string,
  mealPlanRepo: MealPlanRepository,
  recipeRepo: RecipeRepository,
): Promise<Set<string>> {
  const plan = await mealPlanRepo.getById(mealPlanId);
  if (!plan) return new Set();

  const names = new Set<string>();
  for (const entry of plan.entries) {
    if (!entry.recipeId) continue;
    const recipe = await recipeRepo.getById(entry.recipeId);
    if (!recipe) continue;
    for (const ing of recipe.ingredients) {
      names.add(ing.name.toLowerCase());
    }
  }
  return names;
}
