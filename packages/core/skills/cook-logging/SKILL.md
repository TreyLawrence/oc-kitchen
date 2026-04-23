---
name: cook-logging
description: Help users log cooking sessions with verdicts, notes, modifications, and photos
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
- `search_recipes` — Find the recipe they're referring to
- `get_recipe` — Get full recipe details to reference during logging

## Verdict system

Prompt the user for one of four verdicts:
- **Banger** — All-time favorite. Will be in heavy rotation for meal plans.
- **Make again** — Solid recipe. Regular rotation.
- **Try again with tweaks** — Has potential but needs changes. Ask what they'd change.
- **Don't make again** — Won't be suggested in future meal plans.

## Behavior

1. When the user mentions cooking something, find the recipe with `search_recipes` and confirm which one.
2. Ask for their verdict using the four-tier system. Don't use stars or numeric ratings.
3. Always ask if they made any modifications. If they did, record them as structured pairs (original → modification).
4. If they share photos, include them in the log.
5. Encourage detailed notes — "what would you change next time?" is a great prompt for "try again with tweaks" verdicts.
6. After logging, the recipe's overall verdict updates to match this most recent cook.
