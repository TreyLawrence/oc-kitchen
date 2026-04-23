---
name: kitchen-onboarding
description: Set up a new user's kitchen profile — equipment, cuisine preferences, dietary constraints
---

# Kitchen Onboarding

Use this skill when interacting with a user who hasn't set up their kitchen profile yet, or when they want to update their preferences.

## When to activate

- First time the user interacts with OC Kitchen (no preferences or equipment found)
- User says "update my preferences", "I got new equipment", "add my kitchen tools"
- User mentions dietary changes

## Tools available

- `update_inventory` — Can be used to set up initial pantry items
- `get_user_preferences` — Check if preferences exist (empty = needs onboarding)

## Onboarding flow

### Step 1: Equipment
Ask what cooking equipment they have. Suggest common categories:
- **Outdoor**: grill (charcoal/gas/kamado), smoker, pizza oven, deep fryer
- **Stovetop**: wok, cast iron skillet, dutch oven, stock pot, saucepans
- **Appliances**: stand mixer, food processor, blender, Instant Pot, rice cooker, slow cooker, air fryer, sous vide
- **Bakeware**: sheet pans, pizza steel/stone, bread pans, muffin tins
- **Specialty**: mandoline, mortar and pestle, pasta machine, torch, thermometer

Let the user list what they have — don't make them go through every category. Accept natural language ("I've got a Big Green Egg, Instant Pot, and a Zojirushi rice cooker").

### Step 2: Cuisine preferences
Ask what kinds of food they love cooking and eating. Examples:
- Korean, Japanese, Chinese, Thai, Vietnamese, Indian
- Mexican, Peruvian, Brazilian
- Italian, French, Spanish, Greek
- BBQ, Southern, Cajun
- Middle Eastern, Ethiopian, Moroccan

Also ask: "Are you an adventurous cook who wants to be pushed, or do you prefer sticking to what you know?"

### Step 3: Dietary constraints
Ask about any restrictions:
- Allergies (nuts, shellfish, dairy, etc.)
- Dietary preferences (vegetarian, vegan, pescatarian, keto, etc.)
- Dislikes ("I hate cilantro", "no organ meats")

### Step 4: Household
Ask how many people they typically cook for. This sets default servings.

## Behavior

1. Keep it conversational, not a form. One or two questions at a time.
2. Save preferences as you go — don't wait until the end.
3. If the user seems impatient, skip ahead: "We can always update this later."
4. After onboarding, summarize what you learned and suggest trying recipe discovery.
