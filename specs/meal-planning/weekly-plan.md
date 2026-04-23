# Feature: Weekly Meal Planning

## Overview

The weekly meal plan is the centerpiece of OC Kitchen. Each week, the agent proposes a plan that mixes proven favorites (bangers, make-agains) with new recipes to try. The user and agent go back and forth — over iMessage, WhatsApp, or whatever channel they use — until the plan feels right. Once finalized, the plan drives grocery list generation.

## User Stories

- As a user, I can ask the agent to plan my meals for the week
- As a user, I receive a suggested plan that balances familiar favorites with new discoveries
- As a user, I can go back and forth with the agent to tweak the plan ("swap Tuesday", "no Thai this week", "make Sunday a big cook")
- As a user, the plan respects my dietary constraints, equipment, and preferences
- As a user, the plan factors in what's already in my inventory (especially expiring items)
- As a user, I can see my current and past meal plans
- As a user, once I finalize a plan I can generate a grocery list from it

## Data Model

See `shared/data-model.md` → `meal_plans` and `meal_plan_entries` tables.

**Plan statuses:** `"draft"` → `"active"` → `"completed"`
- `draft` — being built/discussed, not finalized
- `active` — the current week's plan, finalized
- `completed` — past week, done

**Day of week:** 0=Monday through 6=Sunday

**Meal types:** `"breakfast"`, `"lunch"`, `"dinner"`, `"snack"`

**Default behavior:** Plans focus on **dinner only** by default. Breakfast/lunch/snack slots are available but opt-in — the agent only plans those if the user asks. Most households improvise non-dinner meals (sandwiches, eggs, etc.), but the option is there for quick weekday lunches or special brunch recipes.

## Tool Contracts

### `suggest_meal_plan`
Generate an AI-suggested weekly plan. This is the main creative tool — it uses cook history, preferences, inventory, and the recipe library to propose a balanced week.

**Parameters:**
```json
{
  "weekStart": "2026-04-27",           // optional, defaults to next Monday
  "constraints": {                      // optional overrides
    "maxNewRecipes": 2,                 // cap on untried recipes
    "preferCuisines": ["korean"],       // bias toward specific cuisines this week
    "avoidCuisines": ["italian"],       // had too much pasta last week
    "quickWeeknight": true,             // weeknight dinners under 60 min
    "bigCookDay": "sunday"              // schedule a project recipe
  }
}
```

**Success:**
```json
{
  "ok": true,
  "plan": {
    "name": "Week of Apr 27",
    "weekStart": "2026-04-27",
    "weekEnd": "2026-05-03",
    "entries": [
      {
        "dayOfWeek": 0,
        "mealType": "dinner",
        "recipeId": "abc123",
        "recipeTitle": "Gochujang Chicken",
        "recipeVerdict": "banger",
        "isNew": false,
        "reason": "One of your bangers — haven't made it in 3 weeks"
      },
      {
        "dayOfWeek": 2,
        "mealType": "dinner",
        "recipeId": null,
        "recipeTitle": "Crispy Sichuan Tofu (new)",
        "isNew": true,
        "reason": "New recipe from Woks of Life — matches your love of Sichuan and uses the wok"
      }
    ],
    "summary": "3 bangers, 1 make-again, 2 new recipes, 1 try-again-with-tweaks. Heavier on Korean and Chinese this week. Sunday is a Big Green Egg project day.",
    "leftoverLunches": "Monday's gochujang chicken (serves 4, household of 2) covers Tuesday lunch. Wednesday's stew covers Thursday lunch."
  }
}
```

### `create_meal_plan`
Save a plan to the database (usually after the user approves a suggestion).

**Parameters:**
```json
{
  "name": "Week of Apr 27",
  "weekStart": "2026-04-27",
  "weekEnd": "2026-05-03",
  "status": "draft",
  "entries": [
    { "dayOfWeek": 0, "mealType": "dinner", "recipeId": "abc123" },
    { "dayOfWeek": 1, "mealType": "dinner", "recipeId": null, "customTitle": "Leftovers" },
    { "dayOfWeek": 2, "mealType": "dinner", "recipeId": "def456" }
  ]
}
```

**Success:** `{ "ok": true, "plan": { "id": "plan1", ... } }`

### `get_meal_plan`
Get a meal plan with full recipe details for each entry.

**Parameters:**
```json
{
  "id": "plan1"               // specific plan
}
```
Or:
```json
{
  "current": true              // get the active plan for this week
}
```

**Success:** Full plan with recipe details, cook history, and notes for each entry.

### `update_meal_plan`
Modify an existing plan — swap recipes, change days, update status.

**Parameters:**
```json
{
  "id": "plan1",
  "status": "active",          // finalize the plan
  "addEntries": [
    { "dayOfWeek": 3, "mealType": "dinner", "recipeId": "ghi789" }
  ],
  "removeEntries": ["entry-id-1"],
  "updateEntries": [
    { "id": "entry-id-2", "recipeId": "new-recipe-id" }
  ]
}
```

## Behavior Rules

1. **Plan composition mix:**
   - 2-3 **bangers** per week (heavy rotation)
   - 1-2 **make again** recipes (regular rotation)
   - 1-2 **new recipes** (untried — imported, generated, or discovered)
   - 0-1 **try again with tweaks** (show the modification notes prominently)
   - 0 **don't make again** (hard block)
2. **Weeknight awareness:** Monday–Thursday dinners should default to < 60 min total time unless the user says otherwise.
3. **Weekend project:** Suggest one project recipe (2+ hours) for Saturday or Sunday if the user has the equipment and inclination.
4. **Cuisine variety:** Don't schedule the same cuisine 3 nights in a row. Spread it out.
5. **Equipment variety:** Don't schedule 5 Instant Pot meals in a row. Use the full equipment list.
6. **Inventory awareness:** Prioritize recipes that use expiring inventory items. Mention this in the suggestion reason.
7. **Recency:** Don't suggest a recipe the user made last week unless they ask for it.
8. **New recipe sources:** When suggesting new recipes, use `discover_recipes` to pull from the user's `favorite_sources` (e.g., Bon Appetit, NYT Cooking, Woks of Life) and `generate_recipe` for AI-created options. Mix both. Don't always pull from the same site.
9. **Dinner-first.** By default, only plan dinners (7 slots per week). If the user asks to plan breakfast, lunch, or snacks, add those slots. Quick lunch recipes (< 30 min) are a good suggestion if the user wants workday meals planned.
10. **Leftovers are a first-class concept.** Most lunches come from reheating dinner leftovers. When suggesting dinner recipes, factor in leftover potential — a recipe that serves 4 for a household of 2 means tomorrow's lunch is covered. The agent should note this: "This makes great leftovers for lunch tomorrow." Don't generate grocery items for leftover meals.
11. **Flexibility:** Plans are living documents. The user can modify them anytime. Status only moves to "completed" after the week is over.
12. **Only one active plan per week.** Creating a new plan for a week that already has one replaces the old one (after confirmation).

## The Conversation Flow

The meal planning conversation typically goes:

1. **User initiates:** "Plan my meals for next week"
2. **Agent checks context:** inventory (what's expiring?), recent cook log (what did we just make?), preferences
3. **Agent proposes:** "Here's what I'm thinking..." with a day-by-day plan and reasons for each pick
4. **User reacts:** "Swap Wednesday", "I'm not feeling Thai", "Make Sunday something on the Big Green Egg"
5. **Agent adjusts:** Proposes alternatives, explains trade-offs
6. **User approves:** "Looks good" / "Let's do it"
7. **Agent saves:** Creates the plan as `active`, offers to generate a grocery list

This can happen over multiple messages across hours or days — that's the beauty of async chat.

## Edge Cases

- User asks for a plan but has no recipes saved → suggest importing some favorites first, or offer to generate a full week of AI recipes
- User asks for a plan but has no preferences set → trigger onboarding first
- All recipes are "don't make again" → rare but handle gracefully, suggest trying new things
- User wants to plan only dinners, not all meals → support partial plans (not every meal type needs to be filled)
- Two plans for the same week → confirm before replacing

## Connections to Other Specs

- **Recipe management** (`recipe-management.md`) — plans reference recipes; verdicts determine rotation frequency
- **Inventory** (`inventory-tracking.md`) — checked before suggesting, expiring items get priority
- **Grocery list** (`grocery-list.md`) — generated from finalized plans
- **Onboarding** (`onboarding.md`) — preferences and equipment inform suggestions
- **Cook logging** (`recipe-management.md`) — recent cooks inform recency filtering
