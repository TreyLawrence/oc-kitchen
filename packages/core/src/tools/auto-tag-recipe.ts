import { RecipeRepository } from "../repositories/recipe.repo.js";
import { UserProfileRepository } from "../repositories/user-profile.repo.js";
import { AutoTaggerService, TypedTag } from "../services/auto-tagger.service.js";

const CUISINE_VOCABULARY = [
  "chinese", "japanese", "korean", "thai", "vietnamese", "indian", "filipino",
  "italian", "french", "mexican", "american", "mediterranean", "greek", "spanish",
  "middle-eastern", "ethiopian", "cajun", "caribbean", "soul-food",
];

const SEASONAL_VOCABULARY = ["summer", "fall", "winter", "spring"];

/**
 * Agent-side tool for on-demand recipe tagging.
 * Gathers recipe context and returns instructions for the agent
 * to classify cuisine and season. The agent responds with tags,
 * which get merged with auto-generated duration/equipment tags.
 */
export function createAutoTagRecipeTool(
  recipeRepo: RecipeRepository,
  profileRepo: UserProfileRepository,
  autoTagger: AutoTaggerService,
) {
  return {
    name: "auto_tag_recipe",
    description:
      "Gather recipe context for cuisine and seasonal tag classification. Returns recipe data, auto-generated tags (duration/equipment), and instructions for the agent to classify cuisine and season.",
    parameters: {
      type: "object",
      properties: {
        recipeId: { type: "string", description: "Recipe ID to tag" },
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

        // Parse existing tags
        const existingTags: TypedTag[] = recipe.tags
          ? JSON.parse(recipe.tags)
          : [];
        const existingUserTags = existingTags.filter((t) => t.type === "user");

        // Generate deterministic auto-tags (duration + equipment)
        const autoTags = await autoTagger.generateTags({
          title: recipe.title,
          instructions: recipe.instructions,
          prepMinutes: recipe.prepMinutes,
          cookMinutes: recipe.cookMinutes,
        });

        respond(true, {
          ok: true,
          recipe: {
            id: recipe.id,
            title: recipe.title,
            instructions: recipe.instructions,
            prepMinutes: recipe.prepMinutes,
            cookMinutes: recipe.cookMinutes,
            ingredients: recipe.ingredients,
          },
          autoTags,
          existingUserTags,
          cuisineVocabulary: CUISINE_VOCABULARY,
          seasonalVocabulary: SEASONAL_VOCABULARY,
          instructions:
            `Classify this recipe's cuisine and season based on its title, ingredients, and instructions. Use the cuisine vocabulary and seasonal vocabulary provided. A recipe can have multiple cuisine tags (e.g., fusion dishes) and multiple seasonal tags. Only apply seasonal tags when the recipe strongly fits a season — not every recipe needs one. Respond by calling update_recipe with the recipeId and your chosen cuisine and seasonal tags.`,
        });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
