# Data Model

## Overview

OC-Kitchen uses SQLite (via Drizzle ORM) with the following tables. All IDs are nanoid-generated text primary keys. All timestamps are ISO 8601 strings.

## Tables

### recipes
The core entity. Stores recipe metadata, instructions, and user feedback.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | nanoid |
| title | text NOT NULL | |
| description | text | |
| source | text NOT NULL | `"ai_generated"`, `"imported"`, or `"manual"` |
| source_url | text | URL if source is `"imported"` |
| servings | integer | |
| prep_minutes | integer | |
| cook_minutes | integer | |
| instructions | text NOT NULL | Markdown formatted |
| verdict | text | Derived from most recent cook log: `"banger"`, `"make_again"`, `"try_again_with_tweaks"`, `"dont_make_again"` |
| is_favorite | boolean | default false |
| tags | text | JSON array of strings |
| notes | text | Personal notes |
| image_url | text | |
| created_at | text NOT NULL | ISO 8601 |
| updated_at | text NOT NULL | ISO 8601 |

### recipe_ingredients
Ingredients belonging to a recipe. Cascade-deleted when the recipe is deleted.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | nanoid |
| recipe_id | text FK NOT NULL | → recipes.id (CASCADE) |
| name | text NOT NULL | e.g., "chicken thighs" |
| quantity | real | e.g., 1.5 |
| unit | text | e.g., "lbs" |
| category | text | "protein", "produce", "dairy", "pantry", "spice", "other" |
| sort_order | integer | default 0 |

### cook_log
Tracks each time a recipe is cooked. Append-only — entries cannot be edited or deleted.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | nanoid |
| recipe_id | text FK NOT NULL | → recipes.id (CASCADE) |
| verdict | text NOT NULL | `"banger"`, `"make_again"`, `"try_again_with_tweaks"`, `"dont_make_again"` |
| notes | text | Free-text notes |
| modifications | text | JSON array of `{ original, modification }` pairs |
| photos | text | JSON array of file paths |
| cooked_at | text NOT NULL | ISO 8601 |

### meal_plans
A weekly meal plan spanning Monday–Sunday.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | nanoid |
| name | text NOT NULL | e.g., "Week of Apr 21" |
| week_start | text NOT NULL | ISO date (Monday) |
| week_end | text NOT NULL | ISO date (Sunday) |
| status | text NOT NULL | `"draft"`, `"active"`, `"completed"` — default `"draft"` |
| notes | text | |
| created_at | text NOT NULL | ISO 8601 |
| updated_at | text NOT NULL | ISO 8601 |

### meal_plan_entries
Individual meals within a plan. Each entry is a recipe (or custom text) assigned to a day and meal type.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | nanoid |
| meal_plan_id | text FK NOT NULL | → meal_plans.id (CASCADE) |
| recipe_id | text FK | → recipes.id (SET NULL on delete) |
| day_of_week | integer NOT NULL | 0=Monday ... 6=Sunday |
| meal_type | text NOT NULL | `"breakfast"`, `"lunch"`, `"dinner"`, `"snack"` |
| custom_title | text | For non-recipe meals, e.g., "Leftover night" |
| category | text | `"exploit"`, `"explore"`, `"leftover"`, `"prep"`, `"skip"` |
| depends_on | text | Recipe ID this entry depends on (e.g., stock for soup) |
| sort_order | integer | default 0 |

### inventory_items
Items currently in the kitchen, including leftovers.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | nanoid |
| name | text NOT NULL | |
| category | text | Same categories as recipe_ingredients |
| isLeftover | boolean | default false — true if this is leftover from a cooked recipe |
| sourceRecipeId | text FK | → recipes.id — which recipe produced this leftover (nullable) |
| quantity | real | |
| unit | text | |
| location | text | `"fridge"`, `"freezer"`, `"pantry"` |
| expires_at | text | ISO date |
| purchased_at | text | ISO date |
| notes | text | |
| created_at | text NOT NULL | ISO 8601 |
| updated_at | text NOT NULL | ISO 8601 |

### grocery_lists
A shopping list, optionally derived from a meal plan.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | nanoid |
| meal_plan_id | text FK | → meal_plans.id (nullable) |
| name | text NOT NULL | |
| status | text NOT NULL | `"draft"`, `"finalized"`, `"ordering"`, `"ordered"` — default `"draft"` |
| created_at | text NOT NULL | ISO 8601 |
| updated_at | text NOT NULL | ISO 8601 |

### grocery_items
Individual items on a grocery list.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | nanoid |
| grocery_list_id | text FK NOT NULL | → grocery_lists.id (CASCADE) |
| name | text NOT NULL | |
| quantity | real | |
| unit | text | |
| category | text | |
| store | text | `"wegmans"`, `"weee"`, `"butcherbox"`, or null (unassigned) |
| is_checked | boolean | default false |
| recipe_id | text FK | → recipes.id (tracks which recipe needs this) |
| sort_order | integer | default 0 |

### grocery_orders
Tracks agent-submitted orders to external stores.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | nanoid |
| grocery_list_id | text FK NOT NULL | → grocery_lists.id |
| store | text NOT NULL | `"wegmans"`, `"weee"`, or `"butcherbox"` |
| status | text NOT NULL | `"pending"`, `"agent_running"`, `"submitted"`, `"failed"`, `"delivered"` — default `"pending"` |
| agent_run_id | text | Correlates with agent process |
| order_total | real | |
| error_message | text | |
| started_at | text | ISO 8601 |
| completed_at | text | ISO 8601 |
| created_at | text NOT NULL | ISO 8601 |
| updated_at | text NOT NULL | ISO 8601 |

### user_equipment
Kitchen equipment owned by the user. Collected during onboarding.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | nanoid |
| name | text NOT NULL | e.g., "Big Green Egg", "Instant Pot" |
| category | text | `"grill"`, `"appliance"`, `"cookware"`, `"bakeware"`, `"outdoor"`, `"tool"` |
| notes | text | |
| created_at | text NOT NULL | ISO 8601 |

### user_preferences
Learned preferences stored as key-value pairs. Updated periodically from cook history.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | nanoid |
| key | text NOT NULL UNIQUE | e.g., `"cuisine_affinities"`, `"spice_tolerance"`, `"dietary_constraints"`, `"household_size"` |
| value | text NOT NULL | JSON value |
| updated_at | text NOT NULL | ISO 8601 |

## Relationships

```
recipes ──< recipe_ingredients
recipes ──< cook_log
recipes ──< meal_plan_entries >── meal_plans
recipes ──< grocery_items >── grocery_lists
meal_plans ──< grocery_lists ──< grocery_orders
```

## Design Principles

1. **Single user, local-first** — each user runs their own OpenClaw gateway with their own SQLite database. No multi-user auth needed.
2. **Soft references for grocery items** — `grocery_items.recipe_id` tracks provenance but doesn't cascade; deleting a recipe doesn't destroy grocery lists.
3. **Store assignment** — `grocery_items.store` and `recipe_ingredients.category` enable smart routing (e.g., Asian specialty items → Weee!, general produce → Wegmans).
4. **Preference learning** — `user_preferences` stores a lightweight summary (cuisine affinities, common modifications). Raw cook log entries are also passed to Claude at generation time for nuance.
