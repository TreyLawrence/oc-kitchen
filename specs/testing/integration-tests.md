# Integration Test Harness

## Overview

`createIntegrationHarness()` wires all repositories, services, and tools against
an in-memory SQLite database. It provides a `call(toolName, params)` helper that
invokes tool handlers and returns captured responses, enabling tests to exercise
multi-layer workflows (tool → service → repository → DB) without mocking.

## API

```ts
const h = createIntegrationHarness();

// Call a tool by name, get the captured response
const result = await h.call("create_recipe", {
  title: "Smoked Pork Shoulder",
  source: "manual",
  instructions: "Low and slow on the BGE",
  ingredients: [{ name: "pork shoulder", quantity: 8, unit: "lbs", category: "protein" }],
});

// result: { success: boolean, data: any }

// Direct access to repos/services for assertions & seeding
h.repos.recipe     // RecipeRepository
h.repos.mealPlan   // MealPlanRepository
h.repos.cookLog    // CookLogRepository
h.repos.grocery    // GroceryRepository
h.repos.inventory  // InventoryRepository
h.repos.order      // OrderRepository
h.repos.userProfile // UserProfileRepository

h.services.autoTagger        // AutoTaggerService
h.services.groceryGeneration // GroceryGenerationService
h.services.deduction         // InventoryDeductionService
h.services.cutoff            // ButcherBoxCutoffService
h.services.preferenceSummary // PreferenceSummaryService
h.services.exploreRatio      // ExploreRatioService
h.services.inventorySync     // InventorySyncService

h.db       // Drizzle instance (for raw queries)
h.sqlite   // better-sqlite3 instance (for close/pragma)
```

## Fixtures

`fixtures.ts` exports seed data and a `seedFixtures(harness)` helper:

- **Recipes**: 3–5 recipes spanning protein, vegetable, quick/project categories
- **User profile**: Equipment list (BGE, Instant Pot, etc.) + preferences
- **Ingredients**: Attached to fixture recipes with realistic categories
- **Tags**: Auto-generated duration + equipment tags

Fixtures use the harness `call()` method so they exercise the same code path as
real tool invocations.

## Design Decisions

- Fresh DB per `createIntegrationHarness()` call — no shared state between tests
- No mocking — all layers wired to real implementations
- `call()` captures the `respond(success, data)` callback and returns `{ success, data }`
- Tools looked up by name from a registry map built during harness construction
