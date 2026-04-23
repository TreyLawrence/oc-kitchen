# Feature: Grocery Ordering

## Overview

After a grocery list is finalized, the user can trigger automated ordering from each store. OC Kitchen uses OpenClaw's computer-use capability to drive a browser, log into the store's website, search for and add items to cart, and either fill the cart (user places final order) or complete checkout.

Each store is a separate OpenClaw plugin (`oc-kitchen-wegmans`, `oc-kitchen-weee`, `oc-kitchen-butcherbox`). This makes stores pluggable — anyone can build `oc-kitchen-instacart`, `oc-kitchen-kroger`, etc.

**ButcherBox is a special case** — it's a subscription service, not a grocery store. Instead of adding items to a cart, the agent customizes the upcoming box before the cutoff date. See the `butcherbox-ordering` skill for details.

## User Stories

- As a user, I can tell the agent to order my groceries from Wegmans and/or Weee!
- As a user, I get progress updates as the agent adds items to my cart
- As a user, I'm alerted when an item can't be found and can suggest alternatives
- As a user, I choose whether the agent just fills the cart or completes checkout
- As a user, I can see order history and status
- As a user, I can have the agent customize my upcoming ButcherBox before the cutoff date
- As a user, I'm reminded when my ButcherBox cutoff is approaching so I can make changes

## Data Model

See `shared/data-model.md` → `grocery_orders` table.

**Order statuses:** `"pending"` → `"agent_running"` → `"submitted"` | `"failed"`  → `"delivered"`

## Tool Contracts

### `order_wegmans` (from `oc-kitchen-wegmans` plugin)

**Parameters:**
```json
{
  "groceryListId": "gl1",
  "checkout": false,             // false = fill cart only, true = complete checkout
  "items": [                     // items assigned to wegmans from the grocery list
    { "name": "chicken thighs", "quantity": 4, "unit": "lbs" },
    { "name": "yellow onions", "quantity": 3, "unit": "count" }
  ]
}
```

**Progress updates** (streamed during execution):
```json
{ "status": "logging_in" }
{ "status": "searching", "item": "chicken thighs" }
{ "status": "added", "item": "chicken thighs", "found": "Wegmans Boneless Chicken Thighs 2.5lb", "price": 8.99 }
{ "status": "not_found", "item": "gochugaru", "suggestion": "Consider ordering from Weee! instead" }
{ "status": "cart_ready", "total": 67.43, "itemsAdded": 11, "itemsMissing": 1 }
```

**Success:** `{ "ok": true, "orderId": "ord1", "total": 67.43, "itemsAdded": 11, "itemsMissing": ["gochugaru"] }`

### `order_weee` (from `oc-kitchen-weee` plugin)

Same interface, Weee!-specific automation.

### `customize_butcherbox` (from `oc-kitchen-butcherbox` plugin)

ButcherBox is a subscription service, not a grocery store. The agent doesn't add items to a cart — it customizes the contents of the upcoming box before the monthly cutoff date.

**Parameters:**
```json
{
  "groceryListId": "gl1",
  "items": [                     // meat items from the grocery list assigned to butcherbox
    { "name": "ground beef", "quantity": 2, "unit": "lbs" },
    { "name": "salmon fillets", "quantity": 1, "unit": "lbs" }
  ]
}
```

**Progress updates** (streamed during execution):
```json
{ "status": "logging_in" }
{ "status": "checking_box", "cutoffDate": "2026-05-01", "currentContents": [...] }
{ "status": "swapping", "remove": "Steak Tips", "add": "Ground Beef 1lb (x2)" }
{ "status": "adding", "item": "Wild Caught Salmon 12oz" }
{ "status": "box_ready", "cutoffDate": "2026-05-01", "contents": [...], "nextDelivery": "2026-05-08" }
```

**Success:** `{ "ok": true, "orderId": "ord3", "cutoffDate": "2026-05-01", "nextDelivery": "2026-05-08", "contents": [...] }`

## Behavior Rules

1. **Cart-only by default.** The agent fills the cart but does NOT complete checkout unless the user explicitly says to. This is a safety measure.
2. **One order per store per list.** A grocery list generates at most one Wegmans order, one Weee! order, and one ButcherBox customization.
3. **Item matching is fuzzy.** "Chicken thighs" should match "Wegmans Boneless Skinless Chicken Thighs". The agent uses Claude to evaluate product matches.
4. **Substitution requires approval.** If an exact match isn't found, the agent presents alternatives and waits for the user to choose (or skip).
5. **Progress is reported conversationally.** Not a progress bar — the agent says "Added chicken thighs ($8.99), searching for onions..." in chat.
6. **Credentials are per-plugin config.** Stored in OpenClaw's plugin config, not in OC Kitchen's database. Each store plugin manages its own auth.
7. **Minimum order enforcement.** Each store plugin declares a minimum order amount in its config (e.g., Weee! = $35). The grocery list generation step flags when a store is below minimum. The ordering tool should refuse to start if the user hasn't acknowledged the warning. The agent can suggest: add staples to hit the minimum, move items to another store, or skip this store's order.
8. **Failures are recoverable.** If the agent crashes mid-order, the cart state persists on the store's website. The user can resume manually or retry.
9. **Order history** is tracked in `grocery_orders` for reference but is not deeply detailed — just status, total, and any errors.
10. **ButcherBox cutoff awareness.** The agent tracks the monthly cutoff date. As it approaches (~3 days before), the agent proactively reminds the user to review their box. If a meal plan calls for meat that could come from ButcherBox, the agent suggests customizing the box accordingly.
11. **ButcherBox operates on box constraints.** Unlike Wegmans/Weee! where you buy exactly what you need, ButcherBox has a fixed box size with swap options. The agent works within these constraints — swapping default items for ones the meal plan needs, and adding extras when available. It reports what it couldn't fit so the user can get those from Wegmans instead.

## Store Plugin Architecture

Each store plugin follows the same pattern:

```
oc-kitchen-<store>/
  openclaw.plugin.json    — plugin manifest with credential config
  src/
    index.ts              — registers order_<store> tool
    automation.ts         — computer-use browser automation
  skills/
    <store>-ordering/
      SKILL.md            — teaches agent when/how to use the ordering tool
```

The automation uses OpenClaw's computer-use API:
1. Launch browser (via Playwright or OpenClaw's built-in browser tool)
2. Navigate to store website
3. Screenshot → send to Claude → receive action → execute → repeat
4. Report results back through the tool's respond callback

## The Conversation Flow

1. **List finalized** → agent offers ordering per store
2. **User confirms** → "Yes, order from Wegmans"
3. **Agent launches** → "Starting Wegmans order... logging in"
4. **Progress updates** → "Added chicken thighs ($8.99)... Added onions ($2.49)..."
5. **Issues** → "Can't find gochugaru at Wegmans. Want me to skip it or try a substitute?"
6. **Completion** → "Wegmans cart is ready — 11 items, $67.43 total. Go to wegmans.com to review and place the order."
7. **Post-order** → "Once your groceries arrive, let me know and I'll update your inventory."
8. **Delivery follow-up** → The next day (or after expected delivery time), the agent proactively asks: "Did your Wegmans order arrive?" If yes, it calls `update_inventory` to add all ordered items (with quantities and estimated expiration dates for perishables). If the user says some items were substituted or missing, the agent adjusts.

**ButcherBox flow** is different because it's subscription-based:
1. **Cutoff approaching** → agent reminds user: "Your ButcherBox cutoff is May 1st. Want me to customize it based on next week's meal plan?"
2. **User confirms** → "Yes, swap in ground beef and salmon"
3. **Agent customizes** → "Logged into ButcherBox... swapping Steak Tips for 2x Ground Beef... adding Wild Caught Salmon as an extra..."
4. **Constraints hit** → "Can't fit chicken thighs in the box — already at max items. Want me to add those to the Wegmans order instead?"
5. **Completion** → "ButcherBox updated — delivering May 8th with: 2x Ground Beef 1lb, 1x Wild Caught Salmon 12oz, 1x Bacon 12oz"

**Delivery follow-up scheduling:** After an order is submitted, the agent sets a standing order to check in after the expected delivery window. For Wegmans same-day pickup, this might be that evening. For Weee! delivery, the next day. For ButcherBox, the scheduled delivery date.

## Edge Cases

- Store website is down → fail gracefully, suggest trying later
- Login fails → clear error, suggest checking credentials in plugin config
- Item search returns too many results → use Claude to pick best match, confirm with user
- Price seems wrong (way higher than expected) → flag to user before adding
- Cart already has items from a previous session → warn user, offer to clear or add to existing
- User wants to order but list isn't finalized → prompt to finalize first
- ButcherBox cutoff already passed → inform user, items fall back to Wegmans
- ButcherBox box is already customized for this cycle → show current contents, ask if user wants to modify again
- Meat item could come from ButcherBox or Wegmans → prefer ButcherBox (better value, already paying for subscription) but respect box size limits

## Connections to Other Specs

- **Grocery list** (`grocery-list.md`) — orders are triggered from finalized lists
- **Inventory** (`inventory-tracking.md`) — after delivery, agent suggests adding items to inventory
- **Onboarding** (`onboarding.md`) — store credentials are configured separately via OpenClaw plugin config, not onboarding
