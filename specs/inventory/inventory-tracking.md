# Feature: Kitchen Inventory Tracking

## Overview

Track what's in the kitchen — fridge, freezer, and pantry. Inventory is used to: (1) subtract from grocery lists so you don't buy what you already have, (2) suggest recipes that use up expiring items, and (3) inform meal plan suggestions.

## User Stories

- As a user, I can tell the agent what I have in my kitchen and it tracks it
- As a user, I can ask "what's in my fridge?" and get a current list
- As a user, I get warned when items are expiring soon
- As a user, my inventory is factored into grocery list generation (don't buy what I have)
- As a user, I can tell the agent "I used up the chicken" and it updates
- As a user, after a grocery order is delivered, inventory is updated with the new items

## Data Model

See `shared/data-model.md` → `inventory_items` table.

**Locations:** `"fridge"`, `"freezer"`, `"pantry"`

**Categories:** Same as `recipe_ingredients` — `"protein"`, `"produce"`, `"dairy"`, `"pantry"`, `"spice"`, `"other"`

## Tool Contracts

### `list_inventory`
List items in the kitchen with optional filters.

**Parameters:**
```json
{
  "location": "fridge",          // optional filter
  "category": "produce",         // optional filter
  "expiringSoon": true,          // items expiring within 3 days
  "query": "chicken"             // free-text search
}
```

**Success:**
```json
{
  "ok": true,
  "items": [
    {
      "id": "inv1",
      "name": "chicken thighs",
      "category": "protein",
      "quantity": 2,
      "unit": "lbs",
      "location": "fridge",
      "expiresAt": "2026-04-25",
      "purchasedAt": "2026-04-22",
      "notes": null
    }
  ],
  "expiringCount": 3
}
```

### `update_inventory`
Add, remove, or modify inventory items. Supports batch operations.

**Parameters:**
```json
{
  "add": [
    {
      "name": "chicken thighs",
      "category": "protein",
      "quantity": 2,
      "unit": "lbs",
      "location": "fridge",
      "expiresAt": "2026-04-28"
    }
  ],
  "remove": ["inv1", "inv2"],
  "update": [
    { "id": "inv3", "quantity": 0.5 }
  ]
}
```

**Success:** `{ "ok": true, "added": 1, "removed": 2, "updated": 1 }`

### `deduct_recipe_ingredients`
Automatically deduct a recipe's ingredients from inventory after cooking. Matches recipe ingredients against inventory items by name (fuzzy) and subtracts quantities. Items that reach zero are removed.

**Parameters:**
```json
{
  "recipeId": "abc123"
}
```

**Process:**
1. Load the recipe's ingredients
2. For each ingredient, fuzzy-match against inventory items (by name)
3. Subtract the recipe's quantity from the matched inventory item
4. If quantity reaches 0 or below, remove the inventory item
5. Report what was deducted and what couldn't be matched

**Success:**
```json
{
  "ok": true,
  "deducted": [
    { "ingredient": "chicken thighs", "amount": "2 lbs", "inventoryItem": "chicken thighs", "remaining": "0 lbs", "removed": true },
    { "ingredient": "gochujang", "amount": "3 tbsp", "inventoryItem": "gochujang", "remaining": "plenty", "removed": false }
  ],
  "unmatched": [
    { "ingredient": "green onions", "reason": "not found in inventory" }
  ]
}
```

### `verify_inventory`
Pre-order inventory check. Returns items that may be stale (not updated recently) or uncertain, so the agent can confirm with the user before generating a grocery list.

**Parameters:**
```json
{
  "mealPlanId": "plan1"        // optional — check items relevant to this plan
}
```

**Success:**
```json
{
  "ok": true,
  "confident": [
    { "name": "soy sauce", "location": "pantry", "lastUpdated": "2026-04-20", "status": "likely accurate" }
  ],
  "needsCheck": [
    { "name": "chicken thighs", "location": "fridge", "lastUpdated": "2026-04-15", "reason": "not updated in 8 days" },
    { "name": "eggs", "location": "fridge", "lastUpdated": "2026-04-10", "reason": "not updated in 13 days, perishable" }
  ],
  "question": "Before I generate your grocery list, can you confirm: do you still have chicken thighs in the fridge and eggs?"
}
```

## Behavior Rules

1. **Natural language input** — "I bought 2 lbs of chicken thighs" should be parsed into structured data. The agent handles this, not the tool.
2. **Expiration tracking** — items with `expiresAt` set. "Expiring soon" = within 3 days. The meal planning skill should prioritize recipes that use expiring items.
3. **Quantities are approximate** — this is a kitchen, not a warehouse. "Some chicken" is fine.
4. **Auto-deduction on cook** — when a cook is logged via `log_cook`, the agent should immediately call `deduct_recipe_ingredients` to subtract used ingredients. This is automatic, not a suggestion. If the user made modifications (recorded in the cook log), the agent should adjust deductions accordingly.
5. **Pre-order verification** — before generating a grocery list, the agent calls `verify_inventory` to flag stale items. Perishable items (produce, protein, dairy) that haven't been updated in 5+ days are flagged. Pantry staples are more lenient (30+ days).
6. **Post-delivery addition** — after a grocery order is marked as delivered, the agent should add the ordered items to inventory via `update_inventory`.
7. **No duplicate policing** — if the user adds "chicken" twice, that's fine. They might have two separate packages.
8. **Pantry staples** — items like salt, olive oil, etc. don't need expiration dates or precise quantities. The user can just note "have" or "running low".

## Connections to Other Specs

- **Grocery list generation** (`grocery-list.md`) subtracts inventory from the plan's ingredient list
- **Meal plan suggestions** (`weekly-plan.md`) checks inventory to prioritize expiring items and suggest recipes using what's on hand
- **Cook logging** (`recipe-management.md`) triggers a suggestion to deduct used ingredients
- **Ordering** (`ordering.md`) triggers a suggestion to add delivered items
