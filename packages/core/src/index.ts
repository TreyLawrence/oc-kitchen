import { getDb } from "./db/index.js";
import { UserProfileRepository } from "./repositories/user-profile.repo.js";
import { RecipeRepository } from "./repositories/recipe.repo.js";
import { CookLogRepository } from "./repositories/cook-log.repo.js";
import { createUpdateUserProfileTool } from "./tools/user-profile-update.js";
import { createGetUserPreferencesTool } from "./tools/user-profile-get.js";
import { createCreateRecipeTool } from "./tools/recipe-create.js";
import { createGetRecipeTool } from "./tools/recipe-get.js";
import { createSearchRecipesTool } from "./tools/recipe-search.js";
import { createUpdateRecipeTool } from "./tools/recipe-update.js";
import { createDeleteRecipeTool } from "./tools/recipe-delete.js";
import { createLogCookTool } from "./tools/cook-log.js";

interface PluginApi {
  registerTool(tool: unknown): void;
}

const plugin = {
  id: "oc-kitchen",
  name: "OC Kitchen",
  description:
    "Recipe management, meal planning, kitchen inventory, and grocery list generation",

  register(api: PluginApi) {
    const db = getDb();

    // Repositories
    const userProfileRepo = new UserProfileRepository(db);
    const recipeRepo = new RecipeRepository(db);
    const cookLogRepo = new CookLogRepository(db);

    // User profile tools
    api.registerTool(createUpdateUserProfileTool(userProfileRepo));
    api.registerTool(createGetUserPreferencesTool(userProfileRepo));

    // Recipe tools
    api.registerTool(createCreateRecipeTool(recipeRepo));
    api.registerTool(createGetRecipeTool(recipeRepo));
    api.registerTool(createSearchRecipesTool(recipeRepo));
    api.registerTool(createUpdateRecipeTool(recipeRepo));
    api.registerTool(createDeleteRecipeTool(recipeRepo));
    api.registerTool(createLogCookTool(cookLogRepo));
  },
};

// Try to use definePluginEntry if available, fall back to bare export
async function loadEntry() {
  try {
    const mod = await import("openclaw/plugin-sdk/plugin-entry");
    if (typeof mod.definePluginEntry === "function") {
      return mod.definePluginEntry(plugin);
    }
  } catch {
    // openclaw not available (e.g., during tests) — export register directly
  }
  return plugin;
}

export default await loadEntry();
