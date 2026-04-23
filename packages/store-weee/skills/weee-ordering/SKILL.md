---
name: weee-ordering
description: Automate grocery ordering from Weee! using computer-use agent
---

# Weee! Ordering

Use this skill when the user wants to order groceries from Weee!.

## When to activate

- User says "order from Weee!", "add to my Weee! cart"
- User has finalized a grocery list with items assigned to the "weee" store
- User asks to place their grocery order for Asian specialty items

## Tools available

- `order_weee` — Launch the computer-use agent to place a Weee! order

## Behavior

1. Before ordering, confirm the grocery list with the user. Show items, quantities, and estimated totals if available.
2. Remind the user that the agent will log into their Weee! account and add items to cart.
3. Ask whether to proceed to checkout or just fill the cart (user places the final order manually).
4. Report progress as the agent works — items found, items substituted, any issues.
5. Weee! specializes in Asian groceries — if a non-Asian item is in the list, suggest moving it to a different store.
6. After completion, report the cart total and any items that couldn't be added.
