---
name: instacart-ordering
description: Automate grocery ordering from any Instacart-supported retailer using computer-use agent
---

# Instacart Ordering

Use this skill when the user wants to order groceries via Instacart.

## When to activate

- User says "order from Wegmans", "order from Instacart", "add to my cart"
- User has finalized a grocery list with items assigned to the "instacart" store
- User asks to place their grocery order

## Tools available

- `order_instacart` — Launch the computer-use agent to place an Instacart order at the specified retailer

## Behavior

1. Before ordering, confirm the grocery list with the user. Show items, quantities, and estimated totals if available.
2. Remind the user that the agent will log into their Instacart account and add items to cart at the specified retailer (defaulting to their configured default store).
3. Ask whether to proceed to checkout or just fill the cart (user places the final order manually).
4. Report progress as the agent works — items found, items substituted, any issues.
5. If an item can't be found, suggest alternatives and ask the user.
6. After completion, report the cart total and any items that couldn't be added.
