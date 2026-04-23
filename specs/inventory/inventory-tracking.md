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

## Behavior Rules

1. **Natural language input** — "I bought 2 lbs of chicken thighs" should be parsed into structured data. The agent handles this, not the tool.
2. **Expiration tracking** — items with `expiresAt` set. "Expiring soon" = within 3 days. The meal planning skill should prioritize recipes that use expiring items.
3. **Quantities are approximate** — this is a kitchen, not a warehouse. "Some chicken" is fine.
4. **Post-cook deduction** — after logging a cook, the agent should suggest deducting used ingredients from inventory. This is a suggestion, not automatic (quantities are approximate and the user may have substituted).
5. **Post-delivery addition** — after a grocery order is marked as delivered, the agent should suggest adding the ordered items to inventory.
6. **No duplicate policing** — if the user adds "chicken" twice, that's fine. They might have two separate packages.
7. **Pantry staples** — items like salt, olive oil, etc. don't need expiration dates or precise quantities. The user can just note "have" or "running low".

## Connections to Other Specs

- **Grocery list generation** (`grocery-list.md`) subtracts inventory from the plan's ingredient list
- **Meal plan suggestions** (`weekly-plan.md`) checks inventory to prioritize expiring items and suggest recipes using what's on hand
- **Cook logging** (`recipe-management.md`) triggers a suggestion to deduct used ingredients
- **Ordering** (`ordering.md`) triggers a suggestion to add delivered items
