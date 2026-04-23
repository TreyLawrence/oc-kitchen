import Anthropic from "@anthropic-ai/sdk";
import { RecipeRepository } from "../repositories/recipe.repo.js";
import { UserProfileRepository } from "../repositories/user-profile.repo.js";

const GENERATION_PROMPT = `You are a creative chef helping someone discover new recipes. Generate a detailed recipe based on their request.

Return ONLY valid JSON with this exact structure (no markdown, no code fences):
{
  "title": "Recipe Title",
  "description": "Brief 1-2 sentence description",
  "servings": 4,
  "prepMinutes": 15,
  "cookMinutes": 30,
  "ingredients": [
    { "name": "ingredient name", "quantity": 1.5, "unit": "cups", "category": "produce" }
  ],
  "instructions": "Markdown formatted step-by-step instructions",
  "tags": ["tag1", "tag2"]
}

Categories for ingredients: protein, produce, dairy, pantry, spice, other
`;

export function createGenerateRecipeTool(
  recipeRepo: RecipeRepository,
  profileRepo: UserProfileRepository,
) {
  return {
    name: "generate_recipe",
    description:
      "Ask Claude to create a new recipe based on a prompt, factoring in the user's kitchen equipment, cuisine preferences, and dietary constraints. The recipe is automatically saved.",
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
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          respond(false, {
            ok: false,
            error:
              "ANTHROPIC_API_KEY not configured. Set it in your environment or OpenClaw plugin config.",
          });
          return;
        }

        // Get user profile for context
        const profile = await profileRepo.getFullProfile();

        // Build the prompt with user context
        let userContext = "";
        if (profile.equipment.length > 0) {
          userContext += `\nKitchen equipment: ${profile.equipment.map((e: any) => e.name).join(", ")}`;
        }
        if (profile.preferences.cuisine_affinities) {
          userContext += `\nCuisine preferences: ${(profile.preferences.cuisine_affinities as string[]).join(", ")}`;
        }
        if (profile.preferences.dietary_constraints) {
          userContext += `\nDietary constraints: ${(profile.preferences.dietary_constraints as string[]).join(", ")}`;
        }
        if (profile.preferences.dislikes) {
          userContext += `\nDislikes: ${(profile.preferences.dislikes as string[]).join(", ")}`;
        }
        if (params.maxMinutes) {
          userContext += `\nMax total time: ${params.maxMinutes} minutes`;
        }
        if (params.servings) {
          userContext += `\nServings: ${params.servings}`;
        }
        if (params.equipment?.length) {
          userContext += `\nMust use: ${params.equipment.join(", ")}`;
        }

        const client = new Anthropic({ apiKey });
        const message = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          system: GENERATION_PROMPT,
          messages: [
            {
              role: "user",
              content: `${params.prompt}${userContext ? `\n\nUser context:${userContext}` : ""}`,
            },
          ],
        });

        const text =
          message.content[0].type === "text" ? message.content[0].text : "";

        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          respond(false, {
            ok: false,
            error: "Failed to parse generated recipe. The AI returned invalid JSON.",
          });
          return;
        }

        // Save the generated recipe
        const recipe = await recipeRepo.create({
          title: parsed.title,
          description: parsed.description,
          source: "ai_generated",
          instructions: parsed.instructions,
          servings: parsed.servings,
          prepMinutes: parsed.prepMinutes,
          cookMinutes: parsed.cookMinutes,
          ingredients: parsed.ingredients,
          tags: parsed.tags,
        });

        respond(true, { ok: true, recipe });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
