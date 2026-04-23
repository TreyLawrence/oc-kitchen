import { UserProfileRepository } from "../repositories/user-profile.repo.js";
import { RecipeRepository } from "../repositories/recipe.repo.js";
import { InventoryRepository } from "../repositories/inventory.repo.js";
import { CookLogRepository } from "../repositories/cook-log.repo.js";
import { detectPrepDependencies } from "../services/prep-dependency.service.js";

/**
 * Gathers all context needed for the agent to build a meal plan.
 * The agent uses its own intelligence to compose the plan —
 * this tool just assembles the inputs.
 */
export function createSuggestMealPlanTool(
  profileRepo: UserProfileRepository,
  recipeRepo: RecipeRepository,
  inventoryRepo: InventoryRepository,
  cookLogRepo: CookLogRepository,
) {
  return {
    name: "suggest_meal_plan",
    description:
      "Gather all context for meal plan generation — user preferences, recipe library, inventory, recent cooks. The agent then builds the plan using its own intelligence.",
    parameters: {
      type: "object",
      properties: {
        weekStart: { type: "string", description: "Monday date (YYYY-MM-DD)" },
        cookingNights: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dayOfWeek: { type: "number" },
              availableMinutes: { type: "number" },
            },
          },
          description: "Which nights to cook and how much time is available",
        },
        constraints: {
          type: "object",
          properties: {
            preferCuisines: { type: "array", items: { type: "string" } },
            avoidCuisines: { type: "array", items: { type: "string" } },
            quickWeeknight: { type: "boolean" },
            bigCookDay: { type: "string" },
            trySomethingNew: { type: "string", enum: ["cuisine", "technique", "ingredient"] },
          },
        },
      },
    },
    handler: async (params: any, { respond }: any) => {
      try {
        // Gather all context
        const profile = await profileRepo.getFullProfile();
        const exploreRatio = (await profileRepo.getPreference("explore_ratio") as number) ?? 0.3;
        const householdSize = (await profileRepo.getPreference("household_size") as number) ?? 2;

        // Get recipe library by verdict
        const bangers = await recipeRepo.search({ verdict: "banger", limit: 50 });
        const makeAgains = await recipeRepo.search({ verdict: "make_again", limit: 50 });
        const tweaks = await recipeRepo.search({ verdict: "try_again_with_tweaks", limit: 20 });
        const uncooked = await recipeRepo.search({ limit: 50 }); // includes uncooked recipes

        // Get inventory state
        const inventory = await inventoryRepo.list({});
        const expiring = await inventoryRepo.list({ expiringSoon: true });
        const leftovers = await inventoryRepo.list({ query: "Leftover:" });

        respond(true, {
          ok: true,
          action: "build_meal_plan",
          context: {
            profile: {
              equipment: profile.equipment.map((e: any) => e.name),
              preferences: profile.preferences,
              householdSize,
              exploreRatio,
            },
            recipeLibrary: {
              bangers: bangers.recipes.map(summarize),
              makeAgains: makeAgains.recipes.map(summarize),
              tweaks: tweaks.recipes.map(summarize),
              uncookedCount: uncooked.recipes.filter((r: any) => !r.verdict).length,
            },
            inventory: {
              expiringItems: expiring.items.map((i: any) => ({ name: i.name, expiresAt: i.expiresAt, location: i.location })),
              leftovers: leftovers.items.map((i: any) => ({ name: i.name, quantity: i.quantity, unit: i.unit, location: i.location })),
            },
            constraints: params.constraints || {},
            cookingNights: params.cookingNights || [],
          },
          instructions:
            `Build a weekly meal plan for ${params.weekStart || "this week"}. Use the context above. Target ${Math.round(exploreRatio * 100)}% explore (new/untried recipes) and ${Math.round((1 - exploreRatio) * 100)}% exploit (bangers + make-agains). Match recipes to available cooking time per night. Account for leftovers (household size: ${householdSize}). Use expiring inventory items first. If any recipe has prepHints (non-empty array), schedule a "Prep:" entry on the prior day with category "prep", and set dependsOn on the main recipe entry to link them. After building the plan, call create_meal_plan to save it.`,
        });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}

function summarize(recipe: any) {
  return {
    id: recipe.id,
    title: recipe.title,
    verdict: recipe.verdict,
    source: recipe.source,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    servings: recipe.servings,
    tags: recipe.tags ? JSON.parse(recipe.tags) : [],
    prepHints: detectPrepDependencies(recipe.instructions || ""),
  };
}
