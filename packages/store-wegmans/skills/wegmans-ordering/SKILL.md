---
name: wegmans-ordering
description: Automate grocery ordering from Wegmans using computer-use agent
---

# Wegmans Ordering

Use this skill when the user wants to order groceries from Wegmans.

## When to activate

- User says "order from Wegmans", "add to my Wegmans cart"
- User has finalized a grocery list with items assigned to the "wegmans" store
- User asks to place their grocery order

## Tools available

- `order_wegmans` — Launch the computer-use agent to place a Wegmans order

## Behavior

1. Before ordering, confirm the grocery list with the user. Show items, quantities, and estimated totals if available.
2. Remind the user that the agent will log into their Wegmans account and add items to cart.
3. Ask whether to proceed to checkout or just fill the cart (user places the final order manually).
4. Report progress as the agent works — items found, items substituted, any issues.
5. If an item can't be found, suggest alternatives and ask the user.
6. After completion, report the cart total and any items that couldn't be added.
