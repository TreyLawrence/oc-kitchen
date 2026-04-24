import { RecipeRepository } from "../repositories/recipe.repo.js";
import { AutoTaggerService } from "../services/auto-tagger.service.js";

export function createUpdateRecipeTool(repo: RecipeRepository, autoTagger?: AutoTaggerService) {
  return {
    name: "update_recipe",
    description:
      "Update recipe fields. Partial updates — only include fields to change. Cannot change source.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Recipe ID" },
        title: { type: "string" },
        description: { type: "string" },
        servings: { type: "number" },
        prepMinutes: { type: "number" },
        cookMinutes: { type: "number" },
        instructions: { type: "string" },
        isFavorite: { type: "boolean" },
        tags: { type: "array", items: { type: "string" } },
        notes: { type: "string" },
      },
      required: ["id"],
    },
    handler: async (params: any, { respond }: any) => {
      try {
        const { id, ...fields } = params;

        // Re-run auto-tagger when timing or instructions change
        const shouldRetag = autoTagger && (
          "prepMinutes" in fields ||
          "cookMinutes" in fields ||
          "instructions" in fields
        );

        if (shouldRetag) {
          const existing = await repo.getById(id);
          if (existing) {
            // Merge updated fields with existing recipe data
            const merged = {
              title: fields.title ?? existing.title,
              instructions: fields.instructions ?? existing.instructions,
              prepMinutes: fields.prepMinutes ?? existing.prepMinutes,
              cookMinutes: fields.cookMinutes ?? existing.cookMinutes,
              tags: existing.tags ? JSON.parse(existing.tags) : [],
            };
            fields.tags = await autoTagger.generateTags(merged);
          }
        }

        await repo.update(id, fields);
        const recipe = await repo.getById(id);
        respond(true, { ok: true, recipe });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
