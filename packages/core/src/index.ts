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
import { createImportRecipeTool } from "./tools/recipe-import.js";
import { createDiscoverRecipesTool } from "./tools/recipe-discover.js";
import { createGenerateRecipeTool, createSaveGeneratedRecipeTool } from "./tools/recipe-generate.js";
import { InventoryRepository } from "./repositories/inventory.repo.js";
import { InventoryDeductionService } from "./services/inventory-deduction.service.js";
import { createListInventoryTool } from "./tools/inventory-list.js";
import { createUpdateInventoryTool } from "./tools/inventory-update.js";
import { createDeductRecipeIngredientsTool } from "./tools/inventory-deduct.js";
import { createVerifyInventoryTool } from "./tools/inventory-verify.js";
import { MealPlanRepository } from "./repositories/meal-plan.repo.js";
import { createCreateMealPlanTool } from "./tools/meal-plan-create.js";
import { createGetMealPlanTool } from "./tools/meal-plan-get.js";
import { createUpdateMealPlanTool } from "./tools/meal-plan-update.js";
import { createSuggestMealPlanTool } from "./tools/meal-plan-suggest.js";
import { createCheckCalendarTool } from "./tools/calendar-check.js";
import { createGeneratePrepListTool } from "./tools/meal-plan-prep-list.js";
import { GroceryRepository } from "./repositories/grocery.repo.js";
import { GroceryGenerationService } from "./services/grocery-generation.service.js";
import { AutoTaggerService } from "./services/auto-tagger.service.js";
import { createGenerateGroceryListTool } from "./tools/grocery-generate.js";
import { createGetGroceryListTool } from "./tools/grocery-get.js";
import { createUpdateGroceryListTool } from "./tools/grocery-update.js";

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
    const inventoryRepo = new InventoryRepository(db);
    const deductionService = new InventoryDeductionService(inventoryRepo, recipeRepo, userProfileRepo);
    const mealPlanRepo = new MealPlanRepository(db);
    const groceryRepo = new GroceryRepository(db);
    const groceryService = new GroceryGenerationService(recipeRepo, mealPlanRepo, inventoryRepo, groceryRepo, userProfileRepo);
    const autoTagger = new AutoTaggerService(userProfileRepo);

    // User profile tools
    api.registerTool(createUpdateUserProfileTool(userProfileRepo));
    api.registerTool(createGetUserPreferencesTool(userProfileRepo));

    // Recipe tools
    api.registerTool(createCreateRecipeTool(recipeRepo, autoTagger));

    api.registerTool(createGetRecipeTool(recipeRepo, cookLogRepo));
    api.registerTool(createSearchRecipesTool(recipeRepo));
    api.registerTool(createUpdateRecipeTool(recipeRepo));
    api.registerTool(createDeleteRecipeTool(recipeRepo));
    api.registerTool(createLogCookTool(cookLogRepo));

    // Recipe discovery tools
    api.registerTool(createImportRecipeTool(recipeRepo, autoTagger));
    api.registerTool(createDiscoverRecipesTool(userProfileRepo));
    api.registerTool(createGenerateRecipeTool(userProfileRepo));
    api.registerTool(createSaveGeneratedRecipeTool(recipeRepo, autoTagger));

    // Inventory tools
    api.registerTool(createListInventoryTool(inventoryRepo));
    api.registerTool(createUpdateInventoryTool(inventoryRepo));
    api.registerTool(createDeductRecipeIngredientsTool(deductionService));
    api.registerTool(createVerifyInventoryTool(inventoryRepo, mealPlanRepo, recipeRepo));

    // Meal planning tools
    api.registerTool(createCreateMealPlanTool(mealPlanRepo));
    api.registerTool(createGetMealPlanTool(mealPlanRepo));
    api.registerTool(createUpdateMealPlanTool(mealPlanRepo));
    api.registerTool(createSuggestMealPlanTool(userProfileRepo, recipeRepo, inventoryRepo, cookLogRepo));
    api.registerTool(createCheckCalendarTool(userProfileRepo));
    api.registerTool(createGeneratePrepListTool(recipeRepo));

    // Grocery tools
    api.registerTool(createGenerateGroceryListTool(groceryService));
    api.registerTool(createGetGroceryListTool(groceryRepo));
    api.registerTool(createUpdateGroceryListTool(groceryRepo));
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
