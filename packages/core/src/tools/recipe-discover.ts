import { UserProfileRepository } from "../repositories/user-profile.repo.js";

export function createDiscoverRecipesTool(profileRepo: UserProfileRepository) {
  return {
    name: "discover_recipes",
    description:
      "Browse the user's favorite recipe sites to find new recipes matching a query or theme. Returns suggestions with URLs — use import_recipe to save them.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search theme (e.g., 'weeknight chicken', 'spicy noodles')" },
        cuisine: { type: "string", description: "Optional cuisine filter (e.g., 'korean', 'mexican')" },
        sources: {
          type: "array",
          items: { type: "string" },
          description: "Override default sources. If omitted, uses user's favorite_sources from preferences.",
        },
        count: { type: "number", description: "How many suggestions to return (default 3)" },
      },
    },
    handler: async (params: any, { respond }: any) => {
      try {
        // Get user's favorite sources if not overridden
        let sources = params.sources;
        if (!sources || sources.length === 0) {
          const pref = await profileRepo.getPreference("favorite_sources");
          sources = (pref as string[]) || [];
        }

        if (sources.length === 0) {
          respond(false, {
            ok: false,
            error:
              "No favorite recipe sources configured. Ask the user to set up their favorite food blogs during onboarding.",
          });
          return;
        }

        const count = params.count || 3;

        // Build search query scoped to user's sites
        // The agent will use OpenClaw's web search tool with this info
        // This tool provides the structured intent; the agent does the actual searching
        const searchQueries = sources.map((site: string) => {
          let q = `site:${site}`;
          if (params.query) q += ` ${params.query}`;
          if (params.cuisine) q += ` ${params.cuisine}`;
          q += " recipe";
          return { site, query: q };
        });

        // Return search instructions for the agent to execute
        // The agent has web search capability — this tool structures the intent
        respond(true, {
          ok: true,
          action: "web_search_needed",
          searchQueries,
          count,
          instructions:
            `Search these queries and return the top ${count} recipe results with title, URL, source site, and a brief description. Present them to the user as suggestions to import.`,
        });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
