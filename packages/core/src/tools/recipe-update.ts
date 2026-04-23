import { RecipeRepository } from "../repositories/recipe.repo.js";

export function createUpdateRecipeTool(repo: RecipeRepository) {
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
        await repo.update(id, fields);
        const recipe = await repo.getById(id);
        respond(true, { ok: true, recipe });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
