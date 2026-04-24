# Feature: Grocery List Generation

## Overview

Once a meal plan is finalized, OC Kitchen generates a grocery list by aggregating all recipe ingredients, subtracting what's already in inventory, and assigning items to stores (Wegmans vs Weee! vs other). The user reviews and tweaks the list before ordering.

## User Stories

- As a user, I can generate a grocery list from my weekly meal plan
- As a user, items I already have in inventory are automatically excluded
- As a user, items are grouped by store based on category (Asian specialties → Weee!, everything else → Wegmans)
- As a user, I can review the list, add/remove items, reassign stores, and check things off
- As a user, I can create a grocery list without a meal plan (ad-hoc shopping)
- As a user, once the list is finalized I can trigger ordering for each store

## Data Model

See `shared/data-model.md` → `grocery_lists`, `grocery_items`, `grocery_orders` tables.

**List statuses:** `"draft"` → `"finalized"` → `"ordering"` → `"ordered"`

**Store assignment logic:**
- Items with `category` matching Asian specialty patterns → `"weee"`
- Everything else → `"wegmans"`
- User can override any assignment
- Items with `store: null` are unassigned (manual purchase)

## Tool Contracts

### `generate_grocery_list`
Generate a grocery list from a meal plan, subtracting inventory.

**Parameters:**
```json
{
  "mealPlanId": "plan1",
  "subtractInventory": true,        // default true
  "includePantryStaples": false,    // default false — excludes common staples
  "name": "Week of Apr 27"          // optional, defaults to plan name
}
```

**Process:**
1. Collect all `recipe_ingredients` from every recipe in the plan
2. Aggregate duplicates (2 recipes both need onions → combine quantities)
3. Subtract matching `inventory_items` (fuzzy match on name + unit)
4. Assign stores based on category
5. Create the list in `draft` status

**Success:**
```json
{
  "ok": true,
  "list": {
    "id": "gl1",
    "name": "Week of Apr 27",
    "status": "draft",
    "items": [
      {
        "id": "gi1",
        "name": "chicken thighs",
        "quantity": 4,
        "unit": "lbs",
        "category": "protein",
        "store": "wegmans",
        "recipeId": "abc123",
        "isChecked": false
      },
      {
        "id": "gi2",
        "name": "gochugaru",
        "quantity": 2,
        "unit": "tbsp",
        "category": "spice",
        "store": "weee",
        "recipeId": "abc123",
        "isChecked": false
      }
    ],
    "subtracted": [
      { "name": "garlic", "had": "1 head", "needed": "1 head", "result": "skipped" },
      { "name": "soy sauce", "had": "plenty", "needed": "3 tbsp", "result": "skipped" }
    ],
    "storeBreakdown": {
      "wegmans": { "itemCount": 12 },
      "weee": { "itemCount": 4, "belowMinimum": true, "minimum": 35 }
    },
    "warnings": [
      "Weee! order has only 4 items — may be below their $35 minimum. Consider adding staples or moving items to Wegmans."
    ]
  }
}
```

### `create_grocery_list`
Create an ad-hoc grocery list without a meal plan — a plain shopping list.

**Parameters:**
```json
{
  "name": "Party supplies",
  "items": [
    { "name": "chips", "quantity": 2, "unit": "bags", "store": "wegmans" },
    { "name": "salsa", "quantity": 1, "unit": "jar" }
  ]
}
```

Items only require `name`; `quantity`, `unit`, `category`, and `store` are all optional.

**Success:**
```json
{
  "ok": true,
  "list": {
    "id": "gl2",
    "name": "Party supplies",
    "mealPlanId": null,
    "status": "draft",
    "items": [...]
  }
}
```

### `get_grocery_list`
Get a grocery list with all items.

**Parameters:** `{ "id": "gl1" }` or `{ "current": true }` (most recent draft/active list)

### `update_grocery_list`
Modify a grocery list — add/remove items, reassign stores, check items, change status.

**Parameters:**
```json
{
  "id": "gl1",
  "status": "finalized",
  "addItems": [
    { "name": "beer", "quantity": 1, "unit": "six-pack", "store": "wegmans" }
  ],
  "removeItems": ["gi3"],
  "updateItems": [
    { "id": "gi2", "store": "wegmans" },
    { "id": "gi1", "isChecked": true }
  ]
}
```

## Behavior Rules

1. **Ingredient aggregation** — if two recipes both need "onion", combine into a single list item with summed quantity. Fuzzy match on name ("yellow onion" and "onion" are the same).
2. **Inventory subtraction** — match inventory items against the ingredient list. If the inventory has enough, skip the item. If partial, reduce the quantity. Report what was subtracted so the user can verify.
3. **Store assignment defaults:**
   - **Proteins → ButcherBox first.** If the user has a ButcherBox subscription and the protein is something BB carries (chicken, beef, pork, salmon, etc.), assign it to ButcherBox. Check if the customization window for the next box is still open. If BB can't cover it (wrong timing, not available), fall back to Wegmans.
   - **Asian specialty ingredients** (gochugaru, doubanjiang, mirin, nori, specific tofu varieties, bok choy, etc.) → Weee!
   - **Everything else** → Wegmans (primary store)
   - If Wegmans is likely to carry it (even if it's Asian-adjacent, like soy sauce or rice) → keep at Wegmans.
   - When in doubt → Wegmans
4. **Minimum order thresholds.** Each store plugin declares a minimum order amount (e.g., Weee! = $35). If a store's assigned items fall below the minimum, the agent warns the user:
   - "Your Weee! order is only $12 — their minimum is $35. Want to add more items, move these to Wegmans, or skip this order?"
   - The agent can suggest additional items to hit the minimum based on pantry staples or things the user buys regularly from that store.
5. **User overrides** — any store assignment can be changed. The system should learn from overrides over time (future enhancement).
6. **Pantry staples** — common items (salt, pepper, olive oil, butter, flour, sugar, etc.) are excluded from the grocery list by default. This prevents cluttering the list with things every kitchen has.
   - **Default list:** salt, pepper, black pepper, olive oil, vegetable oil, canola oil, butter, flour, all-purpose flour, sugar, granulated sugar, brown sugar, baking soda, baking powder, garlic powder, onion powder, paprika, cumin, oregano, thyme, bay leaf, bay leaves, cinnamon, vanilla extract, apple cider vinegar, red wine vinegar, white vinegar, honey, water, ice
   - **Override via inventory:** If a staple exists in inventory with `notes` containing "running low" or "need more", it is NOT excluded (i.e., it stays on the list so the user buys more).
   - **`includePantryStaples` parameter:** The `generate_grocery_list` tool accepts an optional `includePantryStaples` boolean (default `false`). When `true`, no staple filtering is applied.
   - **Reporting:** Excluded staples appear in the `subtracted` array with `result: "pantry staple"` so the user can see what was filtered and override if needed.
7. **Ad-hoc lists** — can be created without a meal plan. Just a plain shopping list.
8. **List is mutable** until ordered — items can be added, removed, or reassigned at any time while in `draft` or `finalized` status.
9. **Finalize before ordering** — status must be `finalized` before triggering a store order. This is a confirmation step.

## The Conversation Flow

1. **User finalizes meal plan** → agent offers: "Want me to generate a grocery list?"
2. **Agent generates list** → presents it grouped by store: "Here's what we need — 12 items from Wegmans, 4 from Weee!"
3. **User reviews** → "Add beer", "I actually have soy sauce", "Move the tofu to Wegmans"
4. **Agent adjusts** → updates the list
5. **User finalizes** → "Looks good"
6. **Agent offers ordering** → "Want me to order from Wegmans? And Weee!?"

## Edge Cases

- Meal plan has recipes with no ingredients → warn user, generate empty list
- Ingredient with no unit vs inventory item with a unit → best-effort match, flag for user
- All items already in inventory → "Looks like you have everything! No shopping needed."
- User wants to split a single item across stores → not supported in v1, pick one store per item
- Generating a list for a plan that already has one → confirm before replacing

## Connections to Other Specs

- **Meal planning** (`weekly-plan.md`) — grocery lists are generated from finalized plans
- **Inventory** (`inventory-tracking.md`) — subtracted from the ingredient list; updated after delivery
- **Recipe management** (`recipe-management.md`) — ingredients come from `recipe_ingredients`
- **Ordering** (`ordering.md`) — triggered after list is finalized, one order per store
