---
name: butcherbox-ordering
description: Manage ButcherBox meat subscription — customize boxes based on upcoming meal plans
---

# ButcherBox Ordering

Use this skill when the user needs to manage their ButcherBox subscription or customize an upcoming box.

## When to activate

- User says "customize my ButcherBox", "what's in my next box"
- Meal plan has protein needs that should come from ButcherBox
- Grocery list generation identifies proteins that ButcherBox carries
- Upcoming box delivery is approaching and the user hasn't customized

## How ButcherBox differs from Wegmans/Weee!

ButcherBox is a **subscription service**, not a grocery store:
- Boxes ship on a recurring schedule (every 2, 4, or 6 weeks)
- Users customize which cuts are in their upcoming box before the cutoff date
- Products are high-quality meat/seafood at fixed subscription prices
- There's a box customization window before each shipment

## Tools available

- `order_butcherbox` — Customize the upcoming ButcherBox shipment via computer-use agent

## Behavior

1. **Know the schedule.** Track when the next box ships and when the customization window closes. Remind the user before the cutoff.
2. **Align with meal plans.** When generating a grocery list, identify proteins that ButcherBox carries (chicken, beef, pork, salmon, etc.) and suggest adding them to the upcoming box instead of buying from Wegmans. "Your meal plan needs 4 lbs of chicken thighs — want to add those to your ButcherBox instead of Wegmans? They'll arrive Thursday."
3. **Don't duplicate.** If protein is coming from ButcherBox, remove it from the Wegmans grocery list.
4. **Inventory awareness.** When the box arrives, add the contents to inventory with appropriate expiration dates (or freezer location for frozen items).
5. **Suggest based on what's good.** ButcherBox sometimes has add-ons or limited items. If the agent notices something that fits the user's preferences, mention it.
6. **Freezer management.** ButcherBox shipments often go straight to the freezer. Track which cuts are frozen and suggest meal plans that thaw and use them before they've been in the freezer too long.
