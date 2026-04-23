import { RecipeRepository } from "../repositories/recipe.repo.js";
import { AutoTaggerService } from "../services/auto-tagger.service.js";

export function createSaveImportedRecipeTool(
  recipeRepo: RecipeRepository,
  autoTagger?: AutoTaggerService,
) {
  return {
    name: "save_imported_recipe",
    description:
      "Save a recipe extracted by the agent from a web page (LLM fallback). Called after import_recipe returns action: 'llm_extract' and the agent extracts structured data from the page text.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Original URL the recipe was imported from" },
        title: { type: "string" },
        description: { type: "string" },
        servings: { type: "number" },
        prepMinutes: { type: "number" },
        cookMinutes: { type: "number" },
        ingredients: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string" },
              category: { type: "string" },
            },
            required: ["name"],
          },
        },
        instructions: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["url", "title", "instructions"],
    },
    handler: async (params: any, { respond }: any) => {
      try {
        const { url, ...recipeData } = params;

        // Check for duplicate URL (spec rule 9: warn, don't block)
        const duplicate = await recipeRepo.findBySourceUrl(url);
        if (duplicate) {
          respond(true, {
            ok: true,
            recipe: duplicate,
            warning: `This recipe has already been imported as "${duplicate.title}"`,
            duplicateId: duplicate.id,
          });
          return;
        }

        if (autoTagger) {
          recipeData.tags = await autoTagger.generateTags(recipeData);
        }

        const recipe = await recipeRepo.create({
          ...recipeData,
          source: "imported",
          sourceUrl: url,
        });

        respond(true, { ok: true, recipe, parseMethod: "llm" });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
