# Feature: Weekly Meal Planning

## Overview

The weekly meal plan is the centerpiece of OC Kitchen. Each week, the agent checks the user's calendar to see which nights they can cook, asks how many meals they want to prepare, and proposes a plan that balances **explore** (new recipes) with **exploit** (proven favorites). The plan accounts for leftovers, multi-day prep sequences, and what's already in inventory.

The conversation happens asynchronously over whatever chat channel the user has — the agent checks in at the start of the week and iterates until the plan feels right.

## User Stories

### Weekly Check-In
- As a user, the agent proactively asks at the start of the week how many nights I'm cooking
- As a user, the agent checks my Google Calendar to see which nights are free vs busy
- As a user, busy nights automatically get "leftovers" or "takeout" — no cooking planned

### Plan Generation
- As a user, I receive a suggested plan that balances new recipes (explore) with proven favorites (exploit)
- As a user, the agent factors in leftovers — if Wednesday's recipe serves 4 for a household of 2, Thursday lunch is covered
- As a user, multi-day recipes are scheduled properly (make stock Tuesday, use it in soup Wednesday)
- As a user, I can go back and forth with the agent to tweak the plan
- As a user, the plan respects my dietary constraints, equipment, and preferences

### Explore vs Exploit
- As a user, the agent suggests new cuisines and techniques to try, not just recipes I already know
- As a user, the balance of new vs familiar adapts based on my feedback over time
- As a user, "try again with tweaks" recipes resurface with the modification notes visible
- As a user, "don't make again" recipes never appear

### Leftovers & Freezer
- As a user, the plan accounts for leftover portions when suggesting how many nights to cook
- As a user, if I'm cooking a big batch, the agent suggests freezing portions for future weeks
- As a user, frozen leftovers from past weeks can be scheduled as meals

### Multi-Day Recipes
- As a user, if a recipe requires advance prep (e.g., marinate overnight, make stock the day before), the agent schedules the prep day too
- As a user, multi-day sequences are clearly labeled ("Prep: chicken stock" → "Cook: chicken noodle soup")

### Prep Delegation
- As a user, I can designate household helpers (nanny, partner, etc.) who can do prep work
- As a user, the agent generates a **prep handoff list** — simple instructions like "dice 2 onions, mince 6 cloves garlic, measure out these spices into a bowl"
- As a user, the prep list is sent to the helper at an appropriate time (e.g., during baby's nap)
- As a user, delegated prep reduces my active cooking time — the agent factors this in when matching recipes to my available time

## Data Model

See `shared/data-model.md` → `meal_plans` and `meal_plan_entries` tables.

**Plan statuses:** `"draft"` → `"active"` → `"completed"`

**Day of week:** 0=Monday through 6=Sunday

**Meal types:** `"breakfast"`, `"lunch"`, `"dinner"`, `"snack"`

**Default behavior:** Plans focus on **dinner only** by default. Breakfast/lunch/snack slots are available but opt-in — the agent only plans those if the user asks. Most households improvise non-dinner meals (sandwiches, eggs, etc.), but the option is there for quick weekday lunches or special brunch recipes.

**Entry types** — `meal_plan_entries` can represent:
- A recipe (`recipeId` set) — cook this recipe
- A leftover (`customTitle` like "Leftover: Gochujang Chicken") — eat from fridge/freezer
- A prep step (`customTitle` like "Prep: Chicken Stock", linked via `recipeId` to the full recipe)
- Takeout/skip (`customTitle` like "Takeout" or "Out to dinner")

## Tool Contracts

### `suggest_meal_plan`
Generate an AI-suggested weekly plan. The agent uses its own intelligence to build the plan, factoring in all available context.

**Parameters:**
```json
{
  "weekStart": "2026-04-27",
  "cookingNights": [                       // from calendar + check-in
    { "dayOfWeek": 0, "availableMinutes": 150 },
    { "dayOfWeek": 2, "availableMinutes": 90 },
    { "dayOfWeek": 4, "availableMinutes": 60 },
    { "dayOfWeek": 6, "availableMinutes": 480 }
  ],
  "constraints": {
    "exploreRatio": 0.3,                    // target 30% new recipes (default)
    "preferCuisines": ["korean"],
    "avoidCuisines": ["italian"],
    "quickWeeknight": true,
    "bigCookDay": "sunday",
    "trySomethingNew": "technique"          // "cuisine" | "technique" | "ingredient" | null
  }
}
```

**Process — the agent gathers context by calling:**
1. `get_user_preferences` — equipment, cuisine affinities, household size, adventurousness
2. `list_inventory` — what's on hand, what's expiring, what leftovers exist (fridge + freezer)
3. `search_recipes` — bangers, make-agains, try-again-with-tweaks in the library
4. `discover_recipes` — new options from favorite sites
5. Google Calendar check — which nights are free

**Then the agent builds a plan considering:**
- **Explore vs exploit ratio:** Default 30% explore (new/untried), 70% exploit (bangers + make-agains). Adjusts based on user feedback.
- **Leftover math:** If recipe serves 6 and household is 2, that's 2 portions leftover → covers 1 future meal. Big batches can mean freezer portions.
- **Multi-day dependencies:** If a recipe needs overnight prep or a sub-recipe (stock, dough, marinade), schedule the prep the night before.
- **Calendar gaps:** Busy nights get leftovers or takeout, not new recipes.
- **Inventory urgency:** Expiring items get priority — use that chicken before Friday.

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
        "dayOfWeek": 0, "mealType": "dinner",
        "recipeId": "abc123", "recipeTitle": "Gochujang Chicken",
        "category": "exploit", "verdict": "banger",
        "reason": "Banger — haven't made it in 3 weeks. Uses the chicken thighs expiring Thursday.",
        "leftoverPortions": 2
      },
      {
        "dayOfWeek": 1, "mealType": "dinner",
        "customTitle": "Leftover: Gochujang Chicken",
        "category": "leftover",
        "reason": "Monday's chicken covers tonight."
      },
      {
        "dayOfWeek": 1, "mealType": "dinner",
        "customTitle": "Prep: Chicken Stock",
        "recipeId": "stock123",
        "category": "prep",
        "reason": "Stock needs to simmer tonight for Wednesday's soup."
      },
      {
        "dayOfWeek": 2, "mealType": "dinner",
        "recipeId": "soup456", "recipeTitle": "Chicken Noodle Soup",
        "category": "exploit", "verdict": "make_again",
        "reason": "Make-again. Uses the stock from last night.",
        "dependsOn": "stock123"
      },
      {
        "dayOfWeek": 3, "mealType": "dinner",
        "customTitle": "Busy night — takeout",
        "category": "skip",
        "reason": "Calendar shows dinner plans at 7pm."
      },
      {
        "dayOfWeek": 4, "mealType": "dinner",
        "recipeId": null, "recipeTitle": "Sichuan Mapo Tofu (new)",
        "category": "explore",
        "reason": "New recipe from Woks of Life — you've been loving Sichuan lately. Uses the wok.",
        "source": "thewoksoflife.com"
      },
      {
        "dayOfWeek": 5, "mealType": "dinner",
        "customTitle": "Leftover: Mapo Tofu + frozen dumplings from freezer",
        "category": "leftover"
      },
      {
        "dayOfWeek": 6, "mealType": "dinner",
        "recipeId": "brisket789", "recipeTitle": "BGE Smoked Brisket (new technique: smoking)",
        "category": "explore",
        "reason": "Sunday project. New technique: low-and-slow smoking on the Big Green Egg. You mentioned wanting to try this.",
        "leftoverPortions": 6,
        "freezerPortions": 4
      }
    ],
    "summary": {
      "cookingNights": 4,
      "explore": 2,
      "exploit": 2,
      "leftovers": 2,
      "skip": 1,
      "exploreRatio": 0.33,
      "newTechnique": "smoking",
      "freezerMeals": "Brisket → 4 portions for future weeks"
    }
  }
}
```

### `check_calendar`
Check Google Calendar for cooking availability. Returns not just free/busy, but **available cooking time** per evening based on the gap between events.

**Parameters:**
```json
{
  "weekStart": "2026-04-27",
  "weekEnd": "2026-05-03",
  "cookingWindowStart": "17:00",       // when user can start cooking (default 5pm)
  "dinnerTargetTime": "19:30"          // when dinner should be ready (default 7:30pm)
}
```

**Success:**
```json
{
  "ok": true,
  "days": [
    { "date": "2026-04-27", "dayOfWeek": 0, "availableMinutes": 150, "canStartAt": "17:00", "mustBeReadyBy": "19:30", "events": [] },
    { "date": "2026-04-28", "dayOfWeek": 1, "availableMinutes": 90, "canStartAt": "18:00", "mustBeReadyBy": "19:30", "events": [{"title": "Team standup", "end": "18:00"}] },
    { "date": "2026-04-29", "dayOfWeek": 2, "availableMinutes": 150, "canStartAt": "17:00", "mustBeReadyBy": "19:30", "events": [] },
    { "date": "2026-04-30", "dayOfWeek": 3, "availableMinutes": 0, "canStartAt": null, "mustBeReadyBy": null, "events": [{"title": "Dinner at Chez Louis", "start": "19:00"}], "skip": true, "reason": "Dinner plans at 7pm" },
    { "date": "2026-05-01", "dayOfWeek": 4, "availableMinutes": 60, "canStartAt": "18:30", "mustBeReadyBy": "19:30", "events": [{"title": "Gym", "end": "18:30"}] },
    { "date": "2026-05-02", "dayOfWeek": 5, "availableMinutes": 150, "canStartAt": "17:00", "mustBeReadyBy": "19:30", "events": [] },
    { "date": "2026-05-03", "dayOfWeek": 6, "availableMinutes": 480, "canStartAt": "10:00", "mustBeReadyBy": "18:00", "events": [], "isWeekend": true }
  ]
}
```

**The agent uses `availableMinutes` to constrain recipe selection:**
- 60 min available → only "quick" or "weeknight" recipes (prep + cook ≤ 60 min)
- 90 min available → most weeknight recipes fit
- 150 min available → full range except project recipes
- 480 min (weekend) → project recipes welcome (smoking, braising, bread)

**Note:** Requires Google Calendar OAuth integration. The OpenClaw plugin config stores the OAuth token. If not connected, falls back to asking the user directly.

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
    { "dayOfWeek": 1, "mealType": "dinner", "customTitle": "Leftover: Gochujang Chicken" },
    { "dayOfWeek": 2, "mealType": "dinner", "recipeId": "soup456", "dependsOn": "stock123" }
  ]
}
```

### `get_meal_plan`
Get a meal plan with full recipe details for each entry.

**Parameters:** `{ "id": "plan1" }` or `{ "current": true }`

### `update_meal_plan`
Modify an existing plan — swap recipes, change days, update status.

**Parameters:**
```json
{
  "id": "plan1",
  "status": "active",
  "addEntries": [...],
  "removeEntries": ["entry-id-1"],
  "updateEntries": [{ "id": "entry-id-2", "recipeId": "new-recipe-id" }]
}
```

### `generate_prep_list`
Generate a simple, standalone prep list for a helper (nanny, partner, etc.) for a specific day's recipe. The list includes only tasks that don't require cooking knowledge — chopping, measuring, marinating, assembling.

**Parameters:**
```json
{
  "recipeId": "abc123",
  "helperName": "Maria"           // optional, for personalized messaging
}
```

**Success:**
```json
{
  "ok": true,
  "prepList": {
    "recipeTitle": "Gochujang Chicken",
    "dinnerTime": "7:30pm",
    "estimatedPrepTime": "15 min",
    "tasks": [
      "Dice 1 medium yellow onion into small pieces",
      "Mince 6 cloves of garlic",
      "Measure 3 tbsp gochujang paste into a small bowl",
      "Measure 1 tbsp soy sauce and 1 tbsp rice vinegar, add to the gochujang bowl and mix",
      "Pat 2 lbs chicken thighs dry with paper towels, place on a plate in the fridge"
    ],
    "notes": "Leave everything on the kitchen counter covered. The mixed sauce can sit at room temperature.",
    "message": "Hey Maria! When you get a chance today, could you do this quick prep for tonight's dinner? Should take about 15 minutes. Thanks!"
  }
}
```

**Design:** The agent generates the prep list from the recipe's ingredients and instructions using its own intelligence. It extracts prep-only tasks (no heat, no technique) and writes them as simple, standalone instructions that someone unfamiliar with the recipe can follow.

## Behavior Rules

### Explore vs Exploit
1. **Explore ratio is set during onboarding** based on adventurousness:
   - `"very adventurous"` → ~60-70% explore (mostly new recipes, proven ones fill the gaps)
   - `"adventurous"` → ~40-50% explore (healthy mix, leaning toward new)
   - `"balanced"` → ~30% explore (default for users who don't specify)
   - `"comfort-focused"` → ~10-20% explore (mostly favorites, occasional new thing)
   
   Stored as `explore_ratio` in user preferences. The agent can adjust over time based on feedback, and the user can change it anytime ("give me more new stuff" or "I want to stick to the hits this week").
2. **Exploit tiers determine frequency:**
   - **Bangers:** Can appear every 2-3 weeks. Heavy rotation.
   - **Make again:** Every 3-4 weeks. Regular rotation.
   - **Try again with tweaks:** Every 4-6 weeks. Show modification notes.
   - **Don't make again:** Never.
3. **Explore sources:** Pull new recipes from user's `favorite_sources` via `discover_recipes` and from AI generation via `generate_recipe`. Mix both.
4. **Proactive exploration:** Periodically suggest a new cuisine the user hasn't tried, a new technique (smoking, fermenting, sous vide), or a challenging recipe to grow their skills. Ask, don't impose: "Want to try something Korean this week?" 
5. **Ratio adapts:** If the user frequently rejects explore suggestions, reduce the ratio. If they rate explores as bangers, increase it.

### Calendar & Time-Aware Cooking
6. **Weekly check-in:** The agent should proactively message at the start of the week (Sunday evening or Monday morning): "How many nights are you cooking this week? Let me check your calendar."
7. **Calendar integration:** Check Google Calendar for evening events. The agent calculates **available cooking time** per night — the gap between when the user can start cooking and when dinner needs to be ready (or the next event).
8. **Time-constrained recipe selection:** Recipes are matched to available time. A night with 60 minutes gets a quick stir fry, not a braise. A free Saturday with 8 hours gets the brisket. The agent should say: "You have about 90 minutes Tuesday — I'm thinking the gochujang chicken (20 min prep + 40 min cook)."
9. **User override:** The user can always override calendar suggestions: "Actually I can cook Thursday even though I have that meeting."

### Leftovers & Portions
9. **Leftover math:** Compare recipe servings to `household_size`. If servings > household_size, the extra portions are tracked. 2 extra portions = 1 additional meal covered.
10. **Leftover placement:** Leftovers go to the next available lunch slot by default. If no lunch is planned, they cover the next non-cooking dinner night.
11. **Freezer strategy:** If a recipe produces 4+ extra portions, suggest freezing some. Frozen leftovers are available for scheduling in future weeks.
12. **Dinner-first.** By default, only plan dinners (7 slots per week). If the user asks to plan breakfast, lunch, or snacks, add those slots. Quick lunch recipes (< 30 min) are a good suggestion if the user wants workday meals planned.
13. **Leftovers are a first-class concept.** Most lunches come from reheating dinner leftovers. When suggesting dinner recipes, factor in leftover potential — a recipe that serves 4 for a household of 2 means tomorrow's lunch is covered. The agent should note this: "This makes great leftovers for lunch tomorrow." Don't generate grocery items for leftover meals.

### Multi-Day Recipes
14. **Prep dependencies:** If a recipe has a sub-recipe or requires advance prep (overnight marinade, stock, dough rise), schedule the prep as a separate entry the day before, linked via `dependsOn`.
15. **Prep entries are lightweight:** A prep entry doesn't take a full cooking night — "simmer stock for 2 hours" can coexist with a regular dinner recipe on the same night.
16. **The agent should identify prep needs** by analyzing recipe instructions for keywords like "overnight", "the day before", "let rest for X hours", "make ahead".

### Prep Delegation
17. **Helpers can do prep.** The user can designate household helpers (nanny, partner) who can do prep tasks. The agent generates a `generate_prep_list` for the helper — simple, standalone instructions (chop this, measure that, marinate these).
18. **Prep reduces active cook time.** If prep is delegated, the agent subtracts prep time from the cook's required time. A recipe with 20 min prep + 40 min cook only needs 40 min from the cook if prep is done ahead.
19. **Prep lists are sent proactively.** Once the user approves the meal plan, the agent can message the helper with the prep list at an appropriate time (e.g., "Hey Maria, when the baby naps, could you do this 15-min prep for tonight?").
20. **Prep tasks are safe.** Only delegate tasks that don't require cooking knowledge or heat — chopping, peeling, measuring, mixing sauces, marinating. Never delegate tasks involving stoves, ovens, or knives that require technique.

### Other
21. **Cuisine variety:** Don't schedule the same cuisine 3 nights in a row.
22. **Equipment variety:** Don't schedule 5 Instant Pot meals in a row.
23. **Inventory urgency:** Prioritize recipes that use expiring inventory items.
24. **Recency:** Don't suggest a recipe the user made last week unless they ask.
25. **Only one active plan per week.**

## The Conversation Flow

1. **Agent initiates (Sunday/Monday):** "Hey! Ready to plan this week's meals? Let me check your calendar..."
2. **Agent checks calendar:** "Looks like Thursday you have dinner plans. So we're looking at 6 nights to fill — how many do you actually want to cook?"
3. **User responds:** "Let's do 4 nights of cooking"
4. **Agent proposes:** Full plan with reasons, explore/exploit breakdown, leftover coverage, any prep nights
5. **User reacts:** "Swap Wednesday", "Can we do something on the Big Green Egg this weekend?", "I'm not in the mood for Thai"
6. **Agent adjusts:** Proposes alternatives with trade-off explanations
7. **Agent probes (explore):** "You haven't tried Ethiopian food yet — want me to find something? Or there's a cool fermentation technique I think you'd enjoy."
8. **User approves:** "Looks good, let's do it"
9. **Agent saves + offers grocery:** Creates plan as active, offers to generate grocery list

## Edge Cases

- User has no free nights → "Looks like a busy week! Want me to suggest some quick freezer meals to defrost, or should we skip planning?"
- User has no recipes → suggest importing favorites first or offer to generate a full week
- No preferences set → trigger onboarding
- All recipes are "don't make again" → lean heavily on explore
- User wants to plan only specific days → support partial plans
- Google Calendar not connected → fall back to asking the user directly
- Multi-day recipe spans a skip day → warn and suggest rescheduling

## Connections to Other Specs

- **Recipe management** (`recipe-management.md`) — verdicts drive rotation frequency
- **Inventory** (`inventory-tracking.md`) — checked for expiring items, leftovers (fridge + freezer)
- **Grocery list** (`grocery-list.md`) — generated from finalized plans (leftovers excluded)
- **Onboarding** (`onboarding.md`) — household_size, equipment, preferences, adventurousness
- **Cook logging** (`recipe-management.md`) — recent cooks inform recency, explore ratio adapts from feedback
