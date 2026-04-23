---
name: cook-logging
description: Help users log cooking sessions with verdicts, notes, modifications, and photos — then update inventory and preferences
---

# Cook Logging

Use this skill when the user has just cooked a recipe and wants to record how it went.

## When to activate

- User says "I just made the...", "we cooked...", "how do I rate this recipe"
- User shares a photo of food they just made
- User wants to record modifications they made to a recipe
- User mentions a dish was great/terrible/needs tweaks

## Tools available

- `log_cook` — Record a cooking session with verdict, notes, modifications, and photos
- `deduct_recipe_ingredients` — Auto-subtract used ingredients from inventory
- `update_inventory` — Add leftover portions to inventory
- `update_user_profile` — Update preference summary if a milestone is reached
- `search_recipes` — Find the recipe they're referring to
- `get_recipe` — Get full recipe details to reference during logging
- `get_user_preferences` — Check household size for leftover calculation

## Verdict system

Prompt the user for one of four verdicts:
- **Banger** — All-time favorite. Will be in heavy rotation for meal plans.
- **Make again** — Solid recipe. Regular rotation.
- **Try again with tweaks** — Has potential but needs changes. Ask what they'd change.
- **Don't make again** — Won't be suggested in future meal plans.

## Full post-cook flow

1. **Identify the recipe** — find it with `search_recipes`, confirm with the user.
2. **Ask for verdict** — use the four-tier system. No stars.
3. **Ask about modifications** — record as structured pairs (original → modification). Especially important for "try again with tweaks."
4. **Collect photos** — if shared, include in the log.
5. **Log the cook** — call `log_cook`. Recipe's overall verdict updates.
6. **Deduct ingredients** — call `deduct_recipe_ingredients` to subtract what was used from inventory. Report what's running low.
7. **Track leftovers** — check `household_size` from preferences. If recipe serves more than the household, add leftover portions to inventory. "You've got 2 portions of gochujang chicken leftover — that's tomorrow's lunch sorted." If 4+ extra portions, suggest freezing some.
8. **Update preference summary** — if this is every 5th cook log, or a banger in a new cuisine, or a "don't make again", regenerate the preference summary by reading recent cook history and calling `update_user_profile`.

## Behavior

- Be conversational. "How'd the gochujang chicken turn out?" not "Please rate this recipe."
- For "try again with tweaks", dig in: "What would you change next time?" These notes are gold for future cooks.
- For "banger", celebrate: "Nice! That's going into heavy rotation."
- For "don't make again", be chill: "No worries, won't suggest it again. What didn't work?"
- Mention leftovers proactively — the user shouldn't have to think about it.
