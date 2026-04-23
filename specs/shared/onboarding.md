# Feature: User Onboarding

## Overview

When a user first installs OC Kitchen, the agent needs to learn about them: what equipment they have, what cuisines they enjoy, any dietary constraints, and how many people they cook for. This happens conversationally — not a form, not a wizard. The `kitchen-onboarding` skill guides the agent through this.

Onboarding data is stored in `user_equipment` and `user_preferences` and is referenced by recipe generation, meal plan suggestions, and grocery list creation.

## User Stories

- As a new user, I'm guided through a conversational onboarding that asks about my kitchen
- As a user, I can update my equipment, preferences, or dietary constraints at any time
- As a user, my preferences inform every recipe suggestion and meal plan I receive

## Data Model

### user_equipment
See `shared/data-model.md`. One row per piece of equipment.

**Equipment categories and common items:**

| Category | Examples |
|----------|---------|
| grill | charcoal grill, gas grill, kamado (Big Green Egg, Kamado Joe), pellet smoker, hibachi |
| appliance | Instant Pot, slow cooker, rice cooker, stand mixer, food processor, blender, immersion blender, air fryer, sous vide, bread machine, ice cream maker, dehydrator |
| cookware | cast iron skillet, wok, dutch oven, stock pot, saucepan set, non-stick pan, stainless steel pan, roasting pan |
| bakeware | sheet pans, pizza steel, pizza stone, bread pans, muffin tin, cake pans, pie dish |
| outdoor | deep fryer (e.g., King Kooker), pizza oven, rotisserie |
| tool | mandoline, mortar and pestle, pasta machine, kitchen torch, thermometer, scale, pressure canner |

The agent should accept natural language ("I have a BGE and an Instant Pot") and normalize to canonical names.

### user_preferences
Key-value pairs in `user_preferences` table:

| Key | Value type | Example |
|-----|-----------|---------|
| `cuisine_affinities` | JSON string[] | `["korean", "mexican", "italian", "bbq"]` |
| `adventurousness` | JSON string | `"very_adventurous"`, `"adventurous"`, `"balanced"`, or `"comfort_focused"` |
| `explore_ratio` | JSON number | `0.6` — derived from adventurousness, adjustable. Fraction of new/untried recipes in weekly meal plans. |
| `dietary_constraints` | JSON string[] | `["no shellfish"]` |
| `dislikes` | JSON string[] | `["cilantro", "organ meats"]` |
| `household_size` | JSON number | `2` |
| `default_servings` | JSON number | `4` |
| `favorite_sources` | JSON string[] | `["bonappetit.com", "cooking.nytimes.com", "thewoksoflife.com"]` |
| `household_helpers` | JSON object[] | `[{"name": "Maria", "role": "nanny", "canDo": ["chopping", "measuring", "marinating"], "availability": "weekday afternoons during baby nap"}]` |
| `cooking_window_start` | JSON string | `"17:00"` — when the user typically starts cooking |
| `dinner_target_time` | JSON string | `"19:30"` — when dinner should be ready |
| `preference_summary` | JSON string | AI-generated summary of learned preferences from cook history |

## Tool Contracts

There's no dedicated onboarding tool — the onboarding skill uses existing tools:

- **Equipment**: The agent calls a general `update_user_profile` tool to add/remove equipment and set preferences
- **Preferences**: Same tool, different keys

### `update_user_profile`
Add or update equipment and preferences.

**Parameters:**
```json
{
  "equipment": {
    "add": [
      { "name": "Big Green Egg", "category": "grill" },
      { "name": "Instant Pot", "category": "appliance" }
    ],
    "remove": ["old-equipment-id"]
  },
  "preferences": {
    "cuisine_affinities": ["korean", "mexican", "italian", "bbq"],
    "adventurousness": "adventurous",
    "household_size": 2,
    "dietary_constraints": ["no shellfish"],
    "dislikes": ["cilantro"]
  }
}
```

**Success:** `{ "ok": true, "equipment": [...], "preferences": {...} }`

### `get_user_preferences`
Retrieve the full user profile for AI context.

**Parameters:** `{}` (no params)

**Success:**
```json
{
  "ok": true,
  "equipment": [
    { "id": "eq1", "name": "Big Green Egg", "category": "grill" },
    { "id": "eq2", "name": "Instant Pot", "category": "appliance" }
  ],
  "preferences": {
    "cuisine_affinities": ["korean", "mexican", "italian", "bbq"],
    "adventurousness": "adventurous",
    "household_size": 2,
    "dietary_constraints": ["no shellfish"],
    "dislikes": ["cilantro"],
    "favorite_sources": ["bonappetit.com", "cooking.nytimes.com", "thewoksoflife.com"],
    "preference_summary": "Loves bold, spicy food. Frequently doubles garlic..."
  }
}
```

## Behavior Rules

1. **Onboarding triggers automatically** when `get_user_preferences` returns empty results.
2. **Conversational, not exhaustive** — ask 1-2 questions at a time. Don't enumerate every category.
3. **Save as you go** — don't wait until the end of onboarding to persist.
4. **Equipment names are normalized** — "BGE" → "Big Green Egg", "IP" → "Instant Pot".
5. **Preferences can always be updated** — "I just got a wok" or "I'm going vegetarian" should work at any time.
6. **`preference_summary`** is regenerated by the agent after meaningful cook log milestones:
   - After every 5th cook log entry
   - After the first "banger" verdict for a new cuisine
   - After a "don't make again" verdict (learn what to avoid)
   - Before generating a weekly meal plan (ensure it's fresh)
   
   The agent reads recent cook logs, notes, and modifications, then updates the summary via `update_user_profile`. This is agent-driven — the agent uses its own intelligence to synthesize patterns like "loves bold spicy food, always doubles garlic, gravitating toward Korean lately, dislikes overly sweet dishes." The summary is passed as context for recipe generation and meal planning.

## Connections to Other Specs

- **Recipe generation** (`recipe-management.md`) reads equipment and preferences to tailor generated recipes
- **Meal plan suggestions** (`weekly-plan.md`) uses preferences to balance cuisine variety and respect constraints
- **Auto-tags** (`recipe-management.md`) match equipment tags against the user's equipment list
- **Grocery list generation** (`grocery-list.md`) doesn't directly use onboarding data but benefits indirectly through better-fitted recipes
