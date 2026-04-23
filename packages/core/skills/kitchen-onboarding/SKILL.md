---
name: kitchen-onboarding
description: Set up a new user's kitchen profile — equipment, preferences, household, helpers, and cooking schedule
---

# Kitchen Onboarding

Use this skill when interacting with a user who hasn't set up their kitchen profile yet, or when they want to update their preferences.

## When to activate

- First time the user interacts with OC Kitchen (no preferences or equipment found via `get_user_preferences`)
- User says "update my preferences", "I got new equipment", "add my kitchen tools"
- User mentions dietary changes or household changes

## Tools available

- `update_user_profile` — add/remove equipment, set preferences
- `get_user_preferences` — check if profile exists (empty = needs onboarding)

## Onboarding flow

Keep it conversational — one or two questions at a time. Save as you go.

### Step 1: Equipment
Ask what cooking equipment they have. Accept natural language ("I've got a Big Green Egg, Instant Pot, and a Zojirushi rice cooker"). Suggest categories if they need prompts:
- **Outdoor**: grill, smoker, pizza oven, deep fryer
- **Stovetop**: wok, cast iron skillet, dutch oven, stock pot
- **Appliances**: Instant Pot, rice cooker, stand mixer, food processor, blender, air fryer, sous vide
- **Bakeware**: sheet pans, pizza steel, bread pans
- **Tools**: mandoline, mortar and pestle, pasta machine, thermometer, scale

### Step 2: Cuisine preferences
Ask what kinds of food they love. Also ask: "Are you an adventurous cook who wants to be pushed to try new things, or do you prefer sticking to what you know?" This sets the explore vs exploit ratio for meal planning.

### Step 3: Favorite recipe sources
Ask: "What food blogs or recipe sites do you love? I'll keep an eye on them for new recipe ideas." Store as `favorite_sources`. Examples: bonappetit.com, cooking.nytimes.com, thewoksoflife.com, seriouseats.com.

### Step 4: Dietary constraints
Ask about allergies, dietary preferences, and strong dislikes.

### Step 5: Household
Ask:
- How many people do you typically cook for? (sets `household_size` and `default_servings`)
- Does anyone in the household help with cooking or prep? If so, who and what can they do? (sets `household_helpers` — e.g., nanny can chop/measure during baby's nap)

### Step 6: Cooking schedule
Ask:
- What time do you usually start cooking on weeknights? (sets `cooking_window_start`, default "17:00")
- What time do you like to eat dinner? (sets `dinner_target_time`, default "19:30")
- Want me to check your Google Calendar to see which nights you're free? (triggers calendar OAuth setup if desired)

## Behavior

1. Keep it conversational, not exhaustive. One or two questions at a time.
2. Save preferences as you go — don't wait until the end.
3. If the user seems impatient, skip ahead: "We can always update this later."
4. Normalize equipment names — "BGE" → "Big Green Egg", "IP" → "Instant Pot".
5. After onboarding, summarize what you learned and suggest trying recipe discovery: "Want me to find some recipes from Bon Appetit to get started?"
