import { RecipeRepository } from "../repositories/recipe.repo.js";
import { AutoTaggerService } from "../services/auto-tagger.service.js";

export function createCreateRecipeTool(repo: RecipeRepository, autoTagger?: AutoTaggerService) {
  return {
    name: "create_recipe",
    description:
      "Create a new recipe manually with title, ingredients, instructions, and optional metadata",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Recipe title" },
        source: {
          type: "string",
          enum: ["manual", "imported", "ai_generated"],
          description: "How this recipe was created",
        },
        instructions: { type: "string", description: "Cooking instructions (markdown)" },
        description: { type: "string", description: "Brief description" },
        sourceUrl: { type: "string", description: "URL if imported" },
        servings: { type: "number", description: "Number of servings" },
        prepMinutes: { type: "number", description: "Prep time in minutes" },
        cookMinutes: { type: "number", description: "Cook time in minutes" },
        ingredients: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string" },
              category: { type: "string", enum: ["protein", "produce", "dairy", "pantry", "spice", "other"] },
            },
            required: ["name"],
          },
        },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["title", "source", "instructions"],
    },
    handler: async (params: any, { respond }: any) => {
      try {
        if (autoTagger) {
          params.tags = await autoTagger.generateTags(params);
        }
        const recipe = await repo.create(params);
        respond(true, { ok: true, recipe });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
