---
name: meal-planning
description: Help users create weekly meal plans — calendar-aware, explore/exploit balanced, with prep delegation
---

# Meal Planning

Use this skill when the user wants to plan their meals for the week, or proactively at the start of each week.

## When to activate

- User asks "what should we eat this week?", "plan my meals", "make a meal plan"
- User mentions an upcoming week or specific days they need meals for
- **Proactive:** Sunday evening or Monday morning, if no plan exists for the upcoming week. Message: "Hey! Ready to plan this week's meals? Let me check your calendar."

## Proactive weekly check-in

This skill should be configured as an OpenClaw standing order to run every Sunday at 5pm (or user-configured time). The standing order triggers the agent to:
1. Check if a plan exists for the upcoming week
2. If not, initiate the meal planning conversation

Configure via OpenClaw: `openclaw standing-orders add --schedule "0 17 * * 0" --message "Check if the user needs a meal plan for this week"`

## Tools available

- `check_calendar` — Check Google Calendar for available cooking time per night
- `suggest_meal_plan` — Gather context for AI plan generation
- `create_meal_plan` — Save a plan to the database
- `update_meal_plan` — Modify an existing plan
- `get_meal_plan` — View current plan details
- `generate_prep_list` — Create a prep handoff list for a household helper
- `search_recipes` — Find recipes to add to the plan
- `discover_recipes` — Browse favorite sites for new recipes
- `list_inventory` — Check what's on hand, what's expiring, what leftovers exist
- `get_user_preferences` — Equipment, cuisines, household size, helpers, cooking window

## The conversation flow

### 1. Check context
Call `check_calendar` to see available time per night. Call `list_inventory` to check expiring items and leftovers. Call `get_user_preferences` for household size, helpers, adventurousness.

### 2. Ask the user
"Looks like you're free Monday, Tuesday, Wednesday, and Saturday. Thursday you have dinner plans. How many nights do you want to cook? You have leftover soup in the fridge that could cover one night."

### 3. Build the plan (explore vs exploit)
Target the user's explore ratio (default ~30% new, ~70% proven). For a 4-cooking-night week:
- 1 **explore** — new recipe from favorite sites or AI-generated. Proactively suggest: "You haven't tried Ethiopian food — want to explore that?" or "Want to try smoking on the Big Green Egg this weekend?"
- 2-3 **exploit** — bangers and make-agains from the library
- Remaining nights covered by leftovers, freezer meals, or takeout

**Match recipes to time:**
- 60 min available → quick/weeknight recipes only
- 90 min → most recipes fit
- Full weekend day → project recipes (smoking, braising, bread)

**If prep can be delegated**, subtract prep time from cook's required time. A 20-min-prep + 40-min-cook recipe only needs 40 min from the cook.

### 4. Present and iterate
"Here's what I'm thinking for the week..." with reasons for each pick (banger, new technique, uses expiring chicken, etc.). Show the explore/exploit breakdown. Invite changes.

### 5. Handle multi-day recipes
If a recipe needs advance prep (stock, marinade, dough), schedule the prep the day before. "Tuesday night while you cook the stir fry, I'll have Maria prep the stock for Wednesday's soup."

### 6. Finalize
Once approved, create the plan as "active". Offer to:
- Generate a grocery list
- Send prep lists to helpers
- Set reminders for prep nights

## Key principles

- **Explore vs exploit** is explicit — label every entry. The ratio adapts based on how explores are rated over time.
- **Calendar is law** — never suggest a recipe that takes longer than the available time.
- **Leftovers are meals** — don't waste them. Schedule them before buying more food.
- **Helpers are force multipliers** — if someone can chop and measure, a 90-minute recipe becomes a 60-minute cook.
- **Be proactive but not annoying** — suggest new cuisines and techniques, but accept "not this week" gracefully.
