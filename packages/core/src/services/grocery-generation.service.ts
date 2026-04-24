import { RecipeRepository } from "../repositories/recipe.repo.js";
import { MealPlanRepository } from "../repositories/meal-plan.repo.js";
import { InventoryRepository } from "../repositories/inventory.repo.js";
import { GroceryRepository } from "../repositories/grocery.repo.js";
import { UserProfileRepository } from "../repositories/user-profile.repo.js";

interface AggregatedIngredient {
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  recipeIds: string[];
}

const ASIAN_SPECIALTY_KEYWORDS = [
  "gochujang", "gochugaru", "doubanjiang", "doenjang",
  "mirin", "sake", "dashi", "nori", "wakame", "kombu",
  "fish sauce", "oyster sauce", "hoisin",
  "shaoxing", "sichuan peppercorn", "star anise",
  "lemongrass", "galangal", "kaffir lime",
  "tamarind", "curry paste", "coconut milk",
  "rice paper", "wonton wrappers", "dumpling wrappers",
  "tofu", "tempeh", "miso",
  "bok choy", "chinese broccoli", "daikon",
  "enoki", "shiitake", "king oyster mushroom",
];

const BUTCHERBOX_PROTEINS = [
  "chicken", "beef", "pork", "salmon", "steak",
  "ground beef", "ground turkey", "turkey", "bacon", "sausage",
  "lamb", "chicken breast", "chicken thigh",
  "pork chop", "pork tenderloin",
  "ribeye", "sirloin", "brisket", "short rib",
];

const PANTRY_STAPLES = [
  "salt", "pepper", "black pepper",
  "olive oil", "vegetable oil", "canola oil",
  "butter",
  "flour", "all-purpose flour",
  "sugar", "granulated sugar", "brown sugar",
  "baking soda", "baking powder",
  "garlic powder", "onion powder",
  "paprika", "cumin", "oregano", "thyme",
  "bay leaf", "bay leaves",
  "cinnamon", "vanilla extract",
  "apple cider vinegar", "red wine vinegar", "white vinegar",
  "honey",
  "water", "ice",
];

const STORE_MINIMUMS: Record<string, number> = {
  weee: 35,
};

export class GroceryGenerationService {
  constructor(
    private recipeRepo: RecipeRepository,
    private mealPlanRepo: MealPlanRepository,
    private inventoryRepo: InventoryRepository,
    private groceryRepo: GroceryRepository,
    private profileRepo?: UserProfileRepository,
  ) {}

  async generateFromPlan(mealPlanId: string, subtractInventory = true, includePantryStaples = false) {
    const plan = await this.mealPlanRepo.getById(mealPlanId);
    if (!plan) throw new Error("Meal plan not found");

    // Check ButcherBox subscription
    let hasButcherBox = false;
    if (this.profileRepo) {
      const bbPref = await this.profileRepo.getPreference("butcherbox_subscription");
      hasButcherBox = bbPref === true;
    }

    // 1. Collect ingredients from recipe entries (skip leftovers, skip, prep-only)
    const cookingEntries = plan.entries.filter(
      (e: any) => e.recipeId && e.category !== "leftover" && e.category !== "skip"
    );

    const allIngredients: Array<{
      name: string;
      quantity: number | null;
      unit: string | null;
      category: string | null;
      recipeId: string;
    }> = [];

    for (const entry of cookingEntries) {
      const recipe = await this.recipeRepo.getById(entry.recipeId);
      if (!recipe) continue;

      for (const ing of recipe.ingredients) {
        allIngredients.push({
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          category: ing.category,
          recipeId: entry.recipeId,
        });
      }
    }

    // 2. Aggregate duplicates
    const aggregated = new Map<string, AggregatedIngredient>();
    for (const ing of allIngredients) {
      const key = ing.name.toLowerCase();
      if (aggregated.has(key)) {
        const existing = aggregated.get(key)!;
        if (existing.quantity !== null && ing.quantity !== null) {
          existing.quantity += ing.quantity;
        }
        if (!existing.recipeIds.includes(ing.recipeId)) {
          existing.recipeIds.push(ing.recipeId);
        }
      } else {
        aggregated.set(key, {
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          category: ing.category,
          recipeIds: [ing.recipeId],
        });
      }
    }

    // 3. Subtract inventory
    const subtracted: Array<{ name: string; had: string; needed: string; result: string }> = [];
    if (subtractInventory) {
      for (const [key, ing] of aggregated) {
        const match = await this.inventoryRepo.findByName(ing.name);
        if (!match) continue;

        if (match.quantity !== null && ing.quantity !== null) {
          if (match.quantity >= ing.quantity) {
            // Fully covered
            subtracted.push({
              name: ing.name,
              had: `${match.quantity} ${match.unit || ""}`.trim(),
              needed: `${ing.quantity} ${ing.unit || ""}`.trim(),
              result: "skipped",
            });
            aggregated.delete(key);
          } else {
            // Partially covered
            const remaining = ing.quantity - match.quantity;
            subtracted.push({
              name: ing.name,
              had: `${match.quantity} ${match.unit || ""}`.trim(),
              needed: `${ing.quantity} ${ing.unit || ""}`.trim(),
              result: `reduced to ${remaining} ${ing.unit || ""}`.trim(),
            });
            ing.quantity = remaining;
          }
        } else if (match.quantity === null) {
          // Pantry staple — assume we have it
          subtracted.push({
            name: ing.name,
            had: "plenty",
            needed: `${ing.quantity || "some"} ${ing.unit || ""}`.trim(),
            result: "skipped",
          });
          aggregated.delete(key);
        }
      }
    }

    // 4. Exclude pantry staples (unless opted in)
    if (!includePantryStaples) {
      for (const [key, ing] of aggregated) {
        const nameLower = ing.name.toLowerCase();
        if (!PANTRY_STAPLES.some((s) => nameLower === s)) continue;

        // Check if inventory says "running low" or "need more"
        const invMatch = await this.inventoryRepo.findByName(ing.name);
        if (invMatch?.notes) {
          const notesLower = invMatch.notes.toLowerCase();
          if (notesLower.includes("running low") || notesLower.includes("need more")) {
            continue; // Keep on list — user needs to restock
          }
        }

        subtracted.push({
          name: ing.name,
          had: "assumed",
          needed: `${ing.quantity || "some"} ${ing.unit || ""}`.trim(),
          result: "pantry staple",
        });
        aggregated.delete(key);
      }
    }

    // 5. Assign stores
    const items = Array.from(aggregated.values()).map((ing) => ({
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      category: ing.category,
      store: this.assignStore(ing, hasButcherBox),
      recipeId: ing.recipeIds[0],
    }));

    // 6. Create the list
    const list = await this.groceryRepo.create({
      name: plan.name,
      mealPlanId,
      items,
    });

    const fullList = await this.groceryRepo.getById(list.id);

    // 7. Calculate store breakdown
    const storeBreakdown: Record<string, { itemCount: number }> = {};
    for (const item of fullList!.items) {
      const store = item.store || "unassigned";
      if (!storeBreakdown[store]) storeBreakdown[store] = { itemCount: 0 };
      storeBreakdown[store].itemCount++;
    }

    // 8. Generate warnings for store minimums
    const warnings: string[] = [];
    for (const [store, minimum] of Object.entries(STORE_MINIMUMS)) {
      if (storeBreakdown[store] && storeBreakdown[store].itemCount < 4) {
        const storeName = store === "weee" ? "Weee!" : store;
        warnings.push(
          `${storeName} order has only ${storeBreakdown[store].itemCount} items — may be below their $${minimum} minimum. Consider adding staples or moving items to Wegmans.`
        );
      }
    }

    return {
      list: fullList!,
      subtracted,
      storeBreakdown,
      warnings,
    };
  }

  private assignStore(ing: AggregatedIngredient, hasButcherBox: boolean): string {
    const nameLower = ing.name.toLowerCase();

    // Check if it's a ButcherBox protein
    if (hasButcherBox && ing.category === "protein") {
      if (BUTCHERBOX_PROTEINS.some((p) => nameLower.includes(p))) {
        return "butcherbox";
      }
    }

    // Check if it's an Asian specialty
    if (ASIAN_SPECIALTY_KEYWORDS.some((kw) => nameLower.includes(kw))) {
      return "weee";
    }

    // Default to Wegmans
    return "wegmans";
  }
}
