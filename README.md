# OC Kitchen

An OpenClaw plugin ecosystem that manages your entire cooking lifecycle through conversation. No website, no app — you text your agent over iMessage, WhatsApp, Slack, or whatever channel you use.

## What it does

**Recipe Discovery** — Import recipes from your favorite food blogs (Bon Appetit, NYT Cooking, Woks of Life), have the agent generate new ones tailored to your equipment and preferences, or browse your favorite sites for inspiration.

**Cook Logging** — After cooking, tell the agent how it went. Four-tier verdict system: *banger* (all-time favorite), *make again* (solid), *try again with tweaks* (has potential), *don't make again* (never suggested again). Log modifications, notes, and photos. The system learns your preferences over time.

**Meal Planning** — Every week, the agent checks your Google Calendar, asks how many nights you're cooking, and proposes a plan that balances **explore** (new recipes) with **exploit** (proven favorites). Plans are time-aware — a 60-minute weeknight gets a stir fry, a free Saturday gets the brisket. Leftovers are tracked and scheduled. Multi-day recipes (stock tonight → soup tomorrow) are handled. Household helpers can be assigned prep work.

**Kitchen Inventory** — Track what's in your fridge, freezer, and pantry. Ingredients auto-deduct when you cook. Leftovers are tracked with portions. Expiring items get priority in meal plans. Before ordering, the agent verifies your inventory is accurate.

**Grocery Ordering** — Generate a grocery list from your meal plan (minus what you already have), assign items to stores, and auto-order via computer-use agents. Proteins route to ButcherBox, Asian specialties to Weee!, everything else to Instacart (defaulting to Wegmans). Minimum order thresholds are enforced.

## Architecture

```
oc-kitchen/
├── packages/
│   ├── core/                  # Main plugin: recipes, plans, inventory, grocery
│   ├── store-instacart/        # Instacart ordering automation (any retailer)
│   ├── store-weee/            # Weee! ordering automation
│   └── store-butcherbox/      # ButcherBox subscription management
├── specs/                     # Feature specifications (source of truth)
└── tests/                     # Cross-package tests
```

This is an **OpenClaw plugin**, not a standalone app. Install it into your OpenClaw gateway and interact through any connected chat channel.

```bash
openclaw plugins install oc-kitchen
openclaw plugins install oc-kitchen-instacart
openclaw plugins install oc-kitchen-weee
openclaw plugins install oc-kitchen-butcherbox
```

## Spec-driven development

Specs in `specs/` are the source of truth. Tests are derived from specs. Code is built to pass the tests.

```
specs/*.md  →  tests/*.test.ts  →  implementation
```

### Specifications

| Spec | What it covers |
|------|---------------|
| [Onboarding](specs/shared/onboarding.md) | Equipment, cuisine preferences, dietary constraints, household helpers, cooking schedule, favorite recipe sources |
| [Data Model](specs/shared/data-model.md) | All 11 database tables, relationships, design principles |
| [Recipe Management](specs/recipes/recipe-management.md) | CRUD, import (JSON-LD + LLM), discover (browse favorite sites), generate (AI), four-tier verdicts, cook logging with modifications and photos |
| [Inventory Tracking](specs/inventory/inventory-tracking.md) | Kitchen contents, auto-deduction after cooking, leftover tracking (fridge + freezer), pre-order verification, expiration warnings |
| [Meal Planning](specs/meal-planning/weekly-plan.md) | Calendar-aware scheduling, explore vs exploit optimization, leftover math, multi-day recipes, prep delegation to household helpers |
| [Grocery Lists](specs/grocery/grocery-list.md) | Generation from meal plans, inventory subtraction, store assignment (ButcherBox → Weee! → Instacart), minimum order enforcement |
| [Ordering](specs/grocery/ordering.md) | Per-store computer-use automation, cart-only default, progress reporting, delivery follow-up |

### Key design decisions

- **Explore vs exploit** — Meal plans balance new recipes with proven favorites. The ratio is set during onboarding based on adventurousness (15% to 65% new recipes) and adapts over time.
- **The agent IS the LLM** — No separate API calls for recipe generation or meal planning. The agent uses its own intelligence; tools provide context and persistence.
- **Leftovers are first-class** — Tracked as inventory items with portions. A recipe that serves 4 for a household of 2 means tomorrow's lunch is covered.
- **Time-aware cooking** — Calendar integration calculates available minutes per evening, not just free/busy. Recipes are matched to the time you actually have.
- **Prep delegation** — Generate simple prep lists for household helpers. Chopping and measuring can be done by anyone; the agent subtracts prep time from the cook's required time.
- **Store routing** — Proteins → ButcherBox (subscription), Asian specialty → Weee! ($35 minimum enforced), everything else → Instacart (default retailer: Wegmans). Pluggable — anyone can build new store plugins.

## Tools (22 in core plugin)

| Category | Tools |
|----------|-------|
| Profile | `get_user_preferences`, `update_user_profile` |
| Recipes | `create_recipe`, `get_recipe`, `search_recipes`, `update_recipe`, `delete_recipe` |
| Discovery | `import_recipe`, `discover_recipes`, `generate_recipe`, `save_generated_recipe` |
| Cook Log | `log_cook` |
| Inventory | `list_inventory`, `update_inventory`, `deduct_recipe_ingredients`, `verify_inventory` |
| Meal Plans | `create_meal_plan`, `get_meal_plan`, `update_meal_plan`, `suggest_meal_plan`, `check_calendar`, `generate_prep_list` |

Plus per-store: `order_instacart`, `order_weee`, `order_butcherbox`

## Skills (7 bundled)

| Skill | Purpose |
|-------|---------|
| `kitchen-onboarding` | 6-step conversational profile setup |
| `recipe-discovery` | Find, import, generate new recipes from favorite sites |
| `cook-logging` | 8-step post-cook flow: verdict → deduct → leftovers → preferences |
| `meal-planning` | Calendar-aware weekly planning with explore/exploit |
| `instacart-ordering` | Grocery cart automation (any Instacart retailer) |
| `weee-ordering` | Asian grocery cart automation |
| `butcherbox-ordering` | Meat subscription box customization |

## Development

```bash
npm install
npm test              # Run unit tests
npm run test:watch    # Watch mode
```

### Database

SQLite via Drizzle ORM. Data lives at `~/.openclaw/oc-kitchen/kitchen.db`.

```bash
cd packages/core
npm run db:generate   # Generate migrations from schema changes
npm run db:migrate    # Apply migrations
```

## License

MIT
