---
name: meal-planning
description: Help users create weekly meal plans mixing proven favorites with new recipes
---

# Meal Planning

Use this skill when the user wants to plan their meals for the week.

## When to activate

- User asks "what should we eat this week?", "plan my meals", "make a meal plan"
- User mentions an upcoming week or specific days they need meals for
- It's Sunday or Monday and the user hasn't planned yet (proactive suggestion)

## Tools available

- `suggest_meal_plan` — Generate an AI-suggested weekly plan based on preferences, cook history, and what's in inventory
- `create_meal_plan` — Create a new meal plan
- `update_meal_plan` — Modify an existing plan (swap recipes, change days)
- `get_meal_plan` — View current plan details
- `search_recipes` — Find recipes to add to the plan
- `list_inventory` — Check what's already in the kitchen
- `get_user_preferences` — Get user's equipment and cuisine preferences

## Behavior

1. Start by checking inventory with `list_inventory` — factor in what's already available and what's expiring soon.
2. Use `suggest_meal_plan` to generate an initial proposal. The suggestion should mix:
   - **Bangers** — heavy rotation (2-3 per week)
   - **Make again** recipes — regular rotation (1-2 per week)
   - **New recipes** — something the user hasn't tried (1-2 per week)
   - **Try again with tweaks** — occasionally, with the modifications noted
   - Never suggest "don't make again" recipes
3. Present the plan conversationally — "Here's what I'm thinking for the week..." — and invite feedback.
4. Be ready for back-and-forth: "swap Tuesday's dinner", "I'm not feeling Thai this week", "add a big cook for Sunday".
5. Consider equipment variety — don't schedule 5 Instant Pot meals in a row.
6. Consider prep time — weeknights should be quicker; weekends can be projects.
7. Once the plan is finalized, offer to generate a grocery list.
