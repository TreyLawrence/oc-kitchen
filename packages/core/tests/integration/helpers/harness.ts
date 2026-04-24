import { createTestDb } from "../../../src/db/index.js";
import { UserProfileRepository } from "../../../src/repositories/user-profile.repo.js";
import { RecipeRepository } from "../../../src/repositories/recipe.repo.js";
import { CookLogRepository } from "../../../src/repositories/cook-log.repo.js";
import { InventoryRepository } from "../../../src/repositories/inventory.repo.js";
import { MealPlanRepository } from "../../../src/repositories/meal-plan.repo.js";
import { GroceryRepository } from "../../../src/repositories/grocery.repo.js";
import { OrderRepository } from "../../../src/repositories/order.repo.js";

import { AutoTaggerService } from "../../../src/services/auto-tagger.service.js";
import { InventoryDeductionService } from "../../../src/services/inventory-deduction.service.js";
import { ButcherBoxCutoffService } from "../../../src/services/butcherbox-cutoff.service.js";
import { GroceryGenerationService } from "../../../src/services/grocery-generation.service.js";
import { PreferenceSummaryService } from "../../../src/services/preference-summary.service.js";
import { ExploreRatioService } from "../../../src/services/explore-ratio.service.js";
import { InventorySyncService } from "../../../src/services/inventory-sync.service.js";

import { createUpdateUserProfileTool } from "../../../src/tools/user-profile-update.js";
import { createGetUserPreferencesTool } from "../../../src/tools/user-profile-get.js";
import { createCreateRecipeTool } from "../../../src/tools/recipe-create.js";
import { createGetRecipeTool } from "../../../src/tools/recipe-get.js";
import { createSearchRecipesTool } from "../../../src/tools/recipe-search.js";
import { createUpdateRecipeTool } from "../../../src/tools/recipe-update.js";
import { createDeleteRecipeTool } from "../../../src/tools/recipe-delete.js";
import { createLogCookTool } from "../../../src/tools/cook-log.js";
import { createImportRecipeTool } from "../../../src/tools/recipe-import.js";
import { createSaveImportedRecipeTool } from "../../../src/tools/recipe-import-save.js";
import { createDiscoverRecipesTool } from "../../../src/tools/recipe-discover.js";
import { createGenerateRecipeTool, createSaveGeneratedRecipeTool } from "../../../src/tools/recipe-generate.js";
import { createAutoTagRecipeTool } from "../../../src/tools/auto-tag-recipe.js";
import { createListInventoryTool } from "../../../src/tools/inventory-list.js";
import { createUpdateInventoryTool } from "../../../src/tools/inventory-update.js";
import { createDeductRecipeIngredientsTool } from "../../../src/tools/inventory-deduct.js";
import { createVerifyInventoryTool } from "../../../src/tools/inventory-verify.js";
import { createSyncDeliveryToInventoryTool } from "../../../src/tools/inventory-sync.js";
import { createCreateMealPlanTool } from "../../../src/tools/meal-plan-create.js";
import { createGetMealPlanTool } from "../../../src/tools/meal-plan-get.js";
import { createUpdateMealPlanTool } from "../../../src/tools/meal-plan-update.js";
import { createSuggestMealPlanTool } from "../../../src/tools/meal-plan-suggest.js";
import { createCheckCalendarTool } from "../../../src/tools/calendar-check.js";
import { createBlockCookingTimeTool } from "../../../src/tools/calendar-block.js";
import { createSyncCookingCalendarTool } from "../../../src/tools/calendar-sync.js";
import { createGeneratePrepListTool } from "../../../src/tools/meal-plan-prep-list.js";
import { createGenerateGroceryListTool } from "../../../src/tools/grocery-generate.js";
import { createCreateGroceryListTool } from "../../../src/tools/grocery-create.js";
import { createGetGroceryListTool } from "../../../src/tools/grocery-get.js";
import { createUpdateGroceryListTool } from "../../../src/tools/grocery-update.js";
import { createStartOrderTool } from "../../../src/tools/order-start.js";
import { createUpdateOrderTool } from "../../../src/tools/order-update.js";
import { createGetOrderTool } from "../../../src/tools/order-get.js";
import { createCheckButcherboxCutoffTool } from "../../../src/tools/butcherbox-cutoff.js";

export interface ToolResponse {
  success: boolean;
  data: any;
}

interface Tool {
  name: string;
  description: string;
  parameters: any;
  handler: (params: any, ctx: { respond: (success: boolean, data: any) => void }) => Promise<void>;
}

export interface IntegrationHarness {
  db: ReturnType<typeof createTestDb>["db"];
  sqlite: ReturnType<typeof createTestDb>["sqlite"];

  repos: {
    recipe: RecipeRepository;
    mealPlan: MealPlanRepository;
    cookLog: CookLogRepository;
    grocery: GroceryRepository;
    inventory: InventoryRepository;
    order: OrderRepository;
    userProfile: UserProfileRepository;
  };

  services: {
    autoTagger: AutoTaggerService;
    groceryGeneration: GroceryGenerationService;
    deduction: InventoryDeductionService;
    cutoff: ButcherBoxCutoffService;
    preferenceSummary: PreferenceSummaryService;
    exploreRatio: ExploreRatioService;
    inventorySync: InventorySyncService;
  };

  call(toolName: string, params?: Record<string, any>): Promise<ToolResponse>;
  getTool(toolName: string): Tool;
  listToolNames(): string[];
}

export function createIntegrationHarness(): IntegrationHarness {
  const { db, sqlite } = createTestDb();

  // Repositories
  const userProfileRepo = new UserProfileRepository(db);
  const recipeRepo = new RecipeRepository(db);
  const cookLogRepo = new CookLogRepository(db);
  const inventoryRepo = new InventoryRepository(db);
  const mealPlanRepo = new MealPlanRepository(db);
  const groceryRepo = new GroceryRepository(db);
  const orderRepo = new OrderRepository(db);

  // Services
  const autoTagger = new AutoTaggerService(userProfileRepo);
  const deduction = new InventoryDeductionService(inventoryRepo, recipeRepo, userProfileRepo);
  const cutoff = new ButcherBoxCutoffService(userProfileRepo, mealPlanRepo, recipeRepo);
  const groceryGeneration = new GroceryGenerationService(
    recipeRepo, mealPlanRepo, inventoryRepo, groceryRepo, userProfileRepo, cutoff,
  );
  const preferenceSummary = new PreferenceSummaryService(cookLogRepo, userProfileRepo);
  const exploreRatio = new ExploreRatioService(cookLogRepo, userProfileRepo);
  const inventorySync = new InventorySyncService(inventoryRepo, groceryRepo);

  // Register all tools into a name→tool map
  const toolList: Tool[] = [
    // User profile
    createUpdateUserProfileTool(userProfileRepo),
    createGetUserPreferencesTool(userProfileRepo),

    // Recipes
    createCreateRecipeTool(recipeRepo, autoTagger),
    createGetRecipeTool(recipeRepo, cookLogRepo),
    createSearchRecipesTool(recipeRepo),
    createUpdateRecipeTool(recipeRepo, autoTagger),
    createDeleteRecipeTool(recipeRepo),
    createLogCookTool(cookLogRepo, recipeRepo, preferenceSummary, exploreRatio),

    // Recipe discovery
    createImportRecipeTool(recipeRepo, autoTagger),
    createSaveImportedRecipeTool(recipeRepo, autoTagger),
    createDiscoverRecipesTool(userProfileRepo),
    createGenerateRecipeTool(userProfileRepo),
    createSaveGeneratedRecipeTool(recipeRepo, autoTagger),
    createAutoTagRecipeTool(recipeRepo, userProfileRepo, autoTagger),

    // Inventory
    createListInventoryTool(inventoryRepo),
    createUpdateInventoryTool(inventoryRepo),
    createDeductRecipeIngredientsTool(deduction),
    createVerifyInventoryTool(inventoryRepo, mealPlanRepo, recipeRepo),
    createSyncDeliveryToInventoryTool(inventorySync),

    // Meal planning
    createCreateMealPlanTool(mealPlanRepo),
    createGetMealPlanTool(mealPlanRepo),
    createUpdateMealPlanTool(mealPlanRepo),
    createSuggestMealPlanTool(userProfileRepo, recipeRepo, inventoryRepo, cookLogRepo, preferenceSummary),
    createCheckCalendarTool(userProfileRepo),
    createBlockCookingTimeTool(userProfileRepo, mealPlanRepo, recipeRepo),
    createSyncCookingCalendarTool(userProfileRepo, mealPlanRepo, recipeRepo),
    createGeneratePrepListTool(recipeRepo, mealPlanRepo, userProfileRepo),

    // Grocery
    createGenerateGroceryListTool(groceryGeneration),
    createCreateGroceryListTool(groceryRepo),
    createGetGroceryListTool(groceryRepo),
    createUpdateGroceryListTool(groceryRepo),

    // Orders
    createStartOrderTool(orderRepo, groceryRepo),
    createUpdateOrderTool(orderRepo),
    createGetOrderTool(orderRepo),

    // ButcherBox
    createCheckButcherboxCutoffTool(cutoff),
  ] as Tool[];

  const toolMap = new Map<string, Tool>();
  for (const tool of toolList) {
    toolMap.set(tool.name, tool);
  }

  return {
    db,
    sqlite,

    repos: {
      recipe: recipeRepo,
      mealPlan: mealPlanRepo,
      cookLog: cookLogRepo,
      grocery: groceryRepo,
      inventory: inventoryRepo,
      order: orderRepo,
      userProfile: userProfileRepo,
    },

    services: {
      autoTagger,
      groceryGeneration,
      deduction,
      cutoff,
      preferenceSummary,
      exploreRatio,
      inventorySync,
    },

    call(toolName: string, params: Record<string, any> = {}): Promise<ToolResponse> {
      const tool = toolMap.get(toolName);
      if (!tool) {
        throw new Error(
          `Unknown tool "${toolName}". Available: ${[...toolMap.keys()].join(", ")}`,
        );
      }
      return new Promise<ToolResponse>((resolve, reject) => {
        tool.handler(params, {
          respond(success: boolean, data: any) {
            resolve({ success, data });
          },
        }).catch(reject);
      });
    },

    getTool(toolName: string): Tool {
      const tool = toolMap.get(toolName);
      if (!tool) {
        throw new Error(
          `Unknown tool "${toolName}". Available: ${[...toolMap.keys()].join(", ")}`,
        );
      }
      return tool;
    },

    listToolNames(): string[] {
      return [...toolMap.keys()];
    },
  };
}
