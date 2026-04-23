import { RecipeRepository } from "../repositories/recipe.repo.js";
import { UserProfileRepository } from "../repositories/user-profile.repo.js";

/**
 * This tool doesn't call the Claude API directly — the agent IS Claude.
 * Instead, it gathers user context and returns instructions for the agent
 * to generate the recipe itself, then saves the result via save_generated_recipe.
 *
 * Flow:
 * 1. Agent calls generate_recipe with user's prompt
 * 2. Tool returns user context + generation instructions
 * 3. Agent generates the recipe using its own intelligence
 * 4. Agent calls save_generated_recipe with the structured result
 */

export function createGenerateRecipeTool(
  profileRepo: UserProfileRepository,
) {
  return {
    name: "generate_recipe",
    description:
      "Gather user context (equipment, preferences, constraints) for recipe generation. Returns context that the agent uses to create the recipe, then saves it via save_generated_recipe.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: 'What kind of recipe to generate (e.g., "a weeknight stir fry with crispy tofu")',
        },
        maxMinutes: { type: "number", description: "Maximum total time in minutes" },
        servings: { type: "number", description: "Number of servings" },
        equipment: {
          type: "array",
          items: { type: "string" },
          description: "Specific equipment to use (e.g., ['wok', 'instant pot'])",
        },
      },
      required: ["prompt"],
    },
    handler: async (params: any, { respond }: any) => {
      try {
        const profile = await profileRepo.getFullProfile();

        const context: Record<string, unknown> = {};
        if (profile.equipment.length > 0) {
          context.equipment = profile.equipment.map((e: any) => e.name);
        }
        if (profile.preferences.cuisine_affinities) {
          context.cuisineAffinities = profile.preferences.cuisine_affinities;
        }
        if (profile.preferences.dietary_constraints) {
          context.dietaryConstraints = profile.preferences.dietary_constraints;
        }
        if (profile.preferences.dislikes) {
          context.dislikes = profile.preferences.dislikes;
        }
        if (profile.preferences.adventurousness) {
          context.adventurousness = profile.preferences.adventurousness;
        }
        if (params.maxMinutes) context.maxMinutes = params.maxMinutes;
        if (params.servings) context.servings = params.servings;
        if (params.equipment?.length) context.mustUse = params.equipment;

        respond(true, {
          ok: true,
          action: "generate_and_save",
          prompt: params.prompt,
          userContext: context,
          instructions:
            `Generate a detailed recipe based on the prompt and user context. Be creative and adventurous. Then call save_generated_recipe with the result as JSON: { title, description, servings, prepMinutes, cookMinutes, ingredients: [{ name, quantity, unit, category }], instructions (markdown), tags }. Categories: protein, produce, dairy, pantry, spice, other.`,
        });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}

export function createSaveGeneratedRecipeTool(
  recipeRepo: RecipeRepository,
) {
  return {
    name: "save_generated_recipe",
    description:
      "Save an AI-generated recipe to the database. Called after the agent generates a recipe via generate_recipe.",
    parameters: {
      type: "object",
      properties: {
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
      required: ["title", "instructions"],
    },
    handler: async (params: any, { respond }: any) => {
      try {
        const recipe = await recipeRepo.create({
          ...params,
          source: "ai_generated",
        });
        respond(true, { ok: true, recipe });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
