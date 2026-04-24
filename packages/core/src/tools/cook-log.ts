import { CookLogRepository } from "../repositories/cook-log.repo.js";
import { RecipeRepository } from "../repositories/recipe.repo.js";
import { PreferenceSummaryService } from "../services/preference-summary.service.js";
import { ExploreRatioService } from "../services/explore-ratio.service.js";

export function createLogCookTool(
  repo: CookLogRepository,
  recipeRepo?: RecipeRepository,
  preferenceSummary?: PreferenceSummaryService,
  exploreRatio?: ExploreRatioService
) {
  return {
    name: "log_cook",
    description:
      "Log a cooking session for a recipe — record your verdict, notes, any modifications you made, and photos. Updates the recipe's overall verdict.",
    parameters: {
      type: "object",
      properties: {
        recipeId: { type: "string", description: "Recipe ID" },
        verdict: {
          type: "string",
          enum: ["banger", "make_again", "try_again_with_tweaks", "dont_make_again"],
          description:
            "How did it go? banger = all-time favorite, make_again = solid, try_again_with_tweaks = has potential but needs changes, dont_make_again = won't suggest again",
        },
        notes: { type: "string", description: "Free-text notes about the cook" },
        modifications: {
          type: "array",
          items: {
            type: "object",
            properties: {
              original: { type: "string", description: "What the recipe called for" },
              modification: { type: "string", description: "What you actually did" },
            },
            required: ["original", "modification"],
          },
          description: "Structured list of changes you made",
        },
        photos: {
          type: "array",
          items: { type: "string" },
          description: "File paths to photos of the cook",
        },
      },
      required: ["recipeId", "verdict"],
    },
    handler: async (params: any, { respond }: any) => {
      try {
        const entry = await repo.logCook(params);

        // Check if preference summary should be regenerated
        let summaryContext = null;
        if (preferenceSummary && recipeRepo) {
          const recipe = await recipeRepo.getById(params.recipeId);
          const recipeTags: string[] = recipe?.tags
            ? (() => { try { return JSON.parse(recipe.tags); } catch { return []; } })()
            : [];
          const trigger = await preferenceSummary.checkTrigger(params.verdict, recipeTags);
          if (trigger.shouldRegenerate) {
            summaryContext = await preferenceSummary.gatherContext();
            summaryContext = { ...summaryContext, triggerReason: trigger.reason };
          }
        }

        // Check if explore ratio should adapt
        let ratioAdaptation = null;
        if (exploreRatio) {
          const adaptation = await exploreRatio.checkAdaptation();
          if (adaptation.adapted) {
            ratioAdaptation = adaptation;
          }
        }

        respond(true, { ok: true, entry, summaryContext, ratioAdaptation });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
