import { RecipeRepository } from "../repositories/recipe.repo.js";
import { CookLogRepository } from "../repositories/cook-log.repo.js";

export function createGetRecipeTool(repo: RecipeRepository, cookLogRepo: CookLogRepository) {
  return {
    name: "get_recipe",
    description:
      "Get a single recipe with its full ingredients list and cook history",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Recipe ID" },
      },
      required: ["id"],
    },
    handler: async (params: any, { respond }: any) => {
      try {
        const recipe = await repo.getById(params.id);
        if (!recipe) {
          respond(false, { ok: false, error: "Recipe not found" });
          return;
        }
        const cookHistory = await cookLogRepo.getHistory(params.id);
        respond(true, {
          ok: true,
          recipe: {
            ...recipe,
            cookLog: cookHistory.map((entry: any) => ({
              id: entry.id,
              verdict: entry.verdict,
              notes: entry.notes,
              modifications: entry.modifications ? JSON.parse(entry.modifications) : null,
              photos: entry.photos ? JSON.parse(entry.photos) : null,
              cookedAt: entry.cookedAt,
            })),
          },
        });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
