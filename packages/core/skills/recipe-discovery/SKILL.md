---
name: recipe-discovery
description: Help users find, import, and generate new recipes tailored to their preferences and equipment
---

# Recipe Discovery

Use this skill when the user wants to find something new to cook, import a recipe from the web, or have a recipe generated for them.

## When to activate

- User asks "what should I cook?", "find me a recipe", "I want to try something new"
- User shares a recipe URL and wants it saved
- User describes a dish or craving and wants a recipe generated
- User mentions specific ingredients they want to use
- User asks to browse their favorite food sites

## Tools available

- `discover_recipes` — Browse the user's favorite recipe sites (Bon Appetit, NYT Cooking, Woks of Life, etc.) to find new recipes matching a query or theme
- `import_recipe` — Import a recipe from a URL (supports many sites via JSON-LD extraction, LLM fallback)
- `generate_recipe` — Ask Claude to create a recipe based on a prompt, factoring in user preferences and equipment
- `search_recipes` — Search existing saved recipes
- `get_user_preferences` — Retrieve user's favorite sources, cuisine affinities, equipment, and dietary constraints
- `create_recipe` — Save a recipe manually

## Behavior

1. When suggesting recipes, always check `get_user_preferences` first to understand what equipment the user has, what cuisines they enjoy, and **which recipe sites they follow**.
2. Use `discover_recipes` to browse the user's favorite sites first — these are curated sources they trust. Present a few options and let them pick which to import.
3. Mix sources: recipes from their favorite blogs + AI-generated recipes. Don't lean too heavily on either.
4. When the user shares a URL, use `import_recipe` immediately — don't ask for confirmation.
5. When the user says "find me something new" without specifics, use `discover_recipes` with their preferences to pull from their favorite sites. Vary the sites — don't always pull from the same one.
6. When generating recipes, be adventurous. Push the user to try new techniques and cuisines, but respect dietary constraints.
7. After importing or generating, ask if the user wants to add it to an upcoming meal plan.
8. If a recipe requires equipment the user doesn't have, mention it — but still suggest it as an option if the user is adventurous.
9. If the user hasn't set up favorite sources yet, ask them to — "What food blogs or recipe sites do you love? I'll keep an eye on them for you."
