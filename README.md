# OC Kitchen

An OpenClaw plugin ecosystem that manages your entire cooking lifecycle through conversation. No website, no app — you text your agent over iMessage, WhatsApp, Slack, or whatever channel you use.

## What it does

### Recipe Management

Import recipes from your favorite food blogs (Bon Appetit, NYT Cooking, Woks of Life) using JSON-LD structured data extraction with LLM fallback for sites without it. Have the agent generate new recipes tailored to your equipment and preferences. Browse your favorite sites for inspiration with `discover_recipes`, then pick which ones to import.

Recipes are auto-tagged on create and update:
- **Duration tags** — `quick` (< 30 min), `weeknight` (< 60 min), `project` (2+ hours)
- **Equipment tags** — matched against your equipment list (Big Green Egg, Instant Pot, wok, etc.)
- **User tags** — free-form, manually added

Duplicate URL detection warns (but doesn't block) when you import the same recipe twice.

### Cook Logging & Preference Learning

After cooking, tell the agent how it went. Four-tier verdict system:

| Verdict | Meaning | Meal plan frequency |
|---------|---------|-------------------|
| **Banger** | All-time favorite | Every 2-3 weeks |
| **Make again** | Solid recipe | Every 3-4 weeks |
| **Try again with tweaks** | Has potential, needs changes | Every 4-6 weeks, with modification notes visible |
| **Don't make again** | Hard block | Never suggested again |

Log modifications (original → changed), notes, and photos. The recipe's verdict always reflects the most recent cook. Cook log is append-only.

The system learns your preferences over time through an AI-generated `preference_summary` that's regenerated after every 5th cook log, after the first banger for a new cuisine, and after any "don't make again" verdict. The explore/exploit ratio also auto-adapts — if you keep rejecting new recipes, the ratio decreases; if you rate explores as bangers, it increases.

### Meal Planning

Every week, the agent checks your Google Calendar, asks how many nights you're cooking, and proposes a plan that balances **explore** (new recipes) with **exploit** (proven favorites).

**Calendar-aware scheduling** — The agent calculates available cooking minutes per evening (not just free/busy). A night with 60 minutes gets a quick stir fry. A free Saturday with 8 hours gets the brisket. Calendar events are created for approved plans with the format "Cook: Gochujang Chicken (20p + 40c)". For recipes with long passive time (braising, smoking), calendar blocks cover active time only and note "Hands-off from X-Y" in the description.

**Explore vs exploit** — The ratio is set during onboarding based on adventurousness:
- Very adventurous → ~60-70% new recipes
- Adventurous → ~40-50%
- Balanced → ~30% (default)
- Comfort-focused → ~10-20%

**Leftover math** — If a recipe serves 6 and the household is 2, that's 4 leftover portions. Two cover tomorrow's lunch, and the agent suggests freezing the rest (4+ portions triggers a freezer suggestion). Leftover meals don't generate grocery items.

**Multi-day recipes** — The agent scans recipe instructions for keywords like "overnight", "the day before", "let rest for X hours", and auto-schedules prep entries on prior days, linked via `dependsOn`.

**Prep delegation** — Designate household helpers (nanny, partner) who can do prep work. The agent generates simple, standalone prep lists with tasks that don't require cooking knowledge — chopping, measuring, marinating. Prep time is subtracted from the cook's required time.

### Kitchen Inventory

Track what's in your fridge, freezer, and pantry. Key behaviors:

- **Auto-deduction** — When you log a cook, ingredients are automatically deducted from inventory. Items at zero are removed.
- **Leftover tracking** — When recipe servings exceed household size, leftovers are created with portions, source recipe, and location (fridge/freezer).
- **Expiration warnings** — Perishable items expiring within 3 days get priority in meal plan suggestions.
- **Pre-order verification** — Before generating a grocery list, the agent flags stale inventory items (perishables not updated in 5+ days, pantry items in 30+ days) and asks you to confirm.
- **Post-delivery sync** — After a grocery order is delivered, ordered items are added to inventory with estimated expiration dates.

### Grocery Lists & Ordering

Generate a grocery list from your meal plan:

1. Aggregate ingredients across all recipes (fuzzy matching — "yellow onion" and "onion" merge)
2. Subtract what's already in inventory
3. Exclude pantry staples (salt, oil, butter) unless running low
4. Assign items to stores:
   - **Proteins → ButcherBox** (if subscribed and customization window is open)
   - **Asian specialties → Weee!** (gochugaru, doubanjiang, mirin, etc.)
   - **Everything else → Instacart** (default retailer: Wegmans)
5. Warn if Weee! order is below $35 minimum

Ordering is automated via computer-use agents that drive a browser to log in, search for items, and fill the cart. Cart-only by default — the agent doesn't complete checkout unless you explicitly say to. Each store is a separate plugin:

- **Instacart** — Generic plugin that works with any Instacart-supported retailer. Takes a `store` parameter (defaults to Wegmans).
- **Weee!** — Asian grocery delivery.
- **ButcherBox** — Subscription service. The agent customizes your upcoming box before the monthly cutoff, swapping default items for what the meal plan needs. Proactive reminders 3 days before cutoff.

After delivery, the agent asks if everything arrived and updates inventory.

### Onboarding

Conversational setup (not a form). The agent asks 1-2 questions at a time and saves as it goes:

- Kitchen equipment (normalized: "BGE" → "Big Green Egg", "IP" → "Instant Pot")
- Cuisine affinities and adventurousness
- Dietary constraints and dislikes
- Household size and default servings
- Household helpers and their availability
- Favorite recipe sources
- Cooking window and dinner target time

## Architecture

This is an **OpenClaw plugin ecosystem**, not a standalone app. Install the plugins into your OpenClaw gateway and interact through any connected chat channel.

```
oc-kitchen/
├── packages/
│   ├── core/                    # Main plugin: recipes, plans, inventory, grocery
│   │   ├── src/
│   │   │   ├── db/              # SQLite schema + migrations (Drizzle ORM)
│   │   │   ├── repositories/    # Data access layer (7 repos)
│   │   │   ├── services/        # Business logic (10 services)
│   │   │   ├── tools/           # Agent-callable tools (35 tools)
│   │   │   └── utils/           # IDs, dates
│   │   ├── skills/              # Agent instruction documents (4 skills)
│   │   └── tests/
│   │       ├── unit/            # Fast, in-memory DB
│   │       └── integration/     # Workflow tests + harness
│   ├── store-instacart/         # Instacart ordering automation (any retailer)
│   ├── store-weee/              # Weee! ordering automation
│   └── store-butcherbox/        # ButcherBox subscription management
├── specs/                       # Feature specifications (source of truth)
│   ├── recipes/                 # Recipe management spec
│   ├── grocery/                 # Grocery lists + ordering specs
│   ├── inventory/               # Inventory tracking spec
│   ├── meal-planning/           # Weekly meal planning spec
│   ├── shared/                  # Data model + onboarding specs
│   └── testing/                 # Integration test spec
└── CLAUDE.md                    # Development conventions
```

### Stack

- **Database** — SQLite via Drizzle ORM, better-sqlite3. Data lives at `~/.openclaw/oc-kitchen/kitchen.db`. Tests use in-memory DB via `createTestDb()`.
- **IDs** — nanoid-generated text primary keys
- **Timestamps** — ISO 8601 strings throughout
- **Tags** — JSON arrays in text columns (typed: equipment, duration, user)

### Plugin pattern

Every tool is a factory function returning `{ name, description, parameters, handler }`. Handlers use a `respond(success, data)` callback — not return values:

```typescript
export function createGetRecipeTool(recipeRepo, cookLogRepo) {
  return {
    name: "get_recipe",
    description: "Get a recipe with ingredients and cook history",
    parameters: { type: "object", properties: { id: { type: "string" } } },
    handler: async (params, { respond }) => {
      const recipe = await recipeRepo.getById(params.id);
      if (!recipe) return respond(false, { ok: false, error: "Recipe not found" });
      const cookLog = await cookLogRepo.getByRecipeId(params.id);
      respond(true, { ok: true, recipe: { ...recipe, cookLog } });
    }
  };
}
```

### Agent-side logic

Tools like `suggest_meal_plan` and `generate_prep_list` gather context and return instructions — the agent (Claude) does the thinking, not the tool. No separate LLM API calls for planning or generation.

## Data model

11 tables across 4 domains:

| Domain | Tables |
|--------|--------|
| Recipes | `recipes`, `recipe_ingredients`, `cook_log` |
| Meal Planning | `meal_plans`, `meal_plan_entries` |
| Inventory | `inventory_items` |
| Grocery | `grocery_lists`, `grocery_items`, `grocery_orders` |
| User | `user_equipment`, `user_preferences` |

Key relationships:
```
recipes ──< recipe_ingredients
recipes ──< cook_log
recipes ──< meal_plan_entries >── meal_plans
recipes ──< grocery_items >── grocery_lists
meal_plans ──< grocery_lists ──< grocery_orders
```

See [specs/shared/data-model.md](specs/shared/data-model.md) for full schema.

## Tools

### Core plugin (35 tools)

| Category | Tools |
|----------|-------|
| Profile | `get_user_preferences`, `update_user_profile` |
| Recipes | `create_recipe`, `get_recipe`, `search_recipes`, `update_recipe`, `delete_recipe` |
| Discovery | `import_recipe`, `save_imported_recipe`, `discover_recipes`, `generate_recipe`, `save_generated_recipe`, `auto_tag_recipe` |
| Cook Log | `log_cook` |
| Inventory | `list_inventory`, `update_inventory`, `deduct_recipe_ingredients`, `verify_inventory`, `sync_delivery_to_inventory` |
| Meal Plans | `create_meal_plan`, `get_meal_plan`, `update_meal_plan`, `suggest_meal_plan`, `generate_prep_list` |
| Calendar | `check_calendar`, `block_cooking_time`, `sync_cooking_calendar` |
| Grocery | `generate_grocery_list`, `create_grocery_list`, `get_grocery_list`, `update_grocery_list` |
| Orders | `start_order`, `get_order`, `update_order`, `check_butcherbox_cutoff` |

### Store plugins

| Plugin | Tool | What it does |
|--------|------|-------------|
| `oc-kitchen-instacart` | `order_instacart` | Browser automation for any Instacart retailer (default: Wegmans) |
| `oc-kitchen-weee` | `order_weee` | Browser automation for Weee! |
| `oc-kitchen-butcherbox` | `customize_butcherbox` | Customize upcoming ButcherBox subscription box |

## Skills

| Skill | Plugin | Purpose |
|-------|--------|---------|
| `kitchen-onboarding` | core | Conversational profile setup: equipment, preferences, household, schedule |
| `recipe-discovery` | core | Find, import, and generate recipes from favorite sites |
| `cook-logging` | core | Post-cook flow: verdict → deduct ingredients → track leftovers → update preferences |
| `meal-planning` | core | Calendar-aware weekly planning with explore/exploit optimization |
| `instacart-ordering` | store-instacart | Grocery cart automation for Instacart retailers |
| `weee-ordering` | store-weee | Asian grocery cart automation |
| `butcherbox-ordering` | store-butcherbox | Meat subscription box customization with cutoff awareness |

## Installation

```bash
openclaw plugins install oc-kitchen
openclaw plugins install oc-kitchen-instacart
openclaw plugins install oc-kitchen-weee
openclaw plugins install oc-kitchen-butcherbox
```

Configure store credentials via OpenClaw's plugin config (not in the OC Kitchen database).

## Development

```bash
npm install
npm test                                           # All unit tests (345 tests, ~4s)
npx vitest run packages/core/tests/unit/           # Unit tests only
npx vitest run packages/core/tests/integration/    # Integration workflow tests
npm run build                                      # TypeScript compilation
```

### Database

```bash
cd packages/core
npm run db:generate   # Generate migrations from schema changes
npm run db:migrate    # Apply migrations
```

### Spec-driven workflow

Specs in `specs/` are the source of truth. Tests are derived from specs. Code is built to pass the tests.

```
specs/*.md  →  tests/*.test.ts  →  implementation
```

### Parallel development

Multiple Claude Code sessions work on this repo simultaneously using shared task lists and worktrees. See [CLAUDE.md](CLAUDE.md) for conventions.

## Specifications

| Spec | What it covers |
|------|---------------|
| [Data Model](specs/shared/data-model.md) | All 11 tables, relationships, design principles |
| [Onboarding](specs/shared/onboarding.md) | Equipment, preferences, dietary constraints, household helpers, cooking schedule |
| [Recipe Management](specs/recipes/recipe-management.md) | CRUD, import (JSON-LD + LLM fallback), discover, generate, four-tier verdicts, cook logging, auto-tagging, preference learning |
| [Inventory Tracking](specs/inventory/inventory-tracking.md) | Kitchen contents, auto-deduction, leftover tracking, pre-order verification, expiration warnings, post-delivery sync |
| [Meal Planning](specs/meal-planning/weekly-plan.md) | Calendar-aware scheduling, explore/exploit, leftover math, multi-day recipes, prep delegation, calendar blocking |
| [Grocery Lists](specs/grocery/grocery-list.md) | Generation from plans, inventory subtraction, fuzzy aggregation, store assignment, pantry staple exclusion, minimum order enforcement |
| [Ordering](specs/grocery/ordering.md) | Per-store computer-use automation, Instacart (generic), Weee!, ButcherBox subscription, delivery follow-up |
| [Integration Testing](specs/testing/integration-tests.md) | Test harness, workflow tests, agent E2E scenarios |

## License

MIT
