import { RecipeRepository } from "../repositories/recipe.repo.js";
import { MealPlanRepository } from "../repositories/meal-plan.repo.js";
import { InventoryRepository } from "../repositories/inventory.repo.js";
import { GroceryRepository } from "../repositories/grocery.repo.js";

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

export class GroceryGenerationService {
  constructor(
    private recipeRepo: RecipeRepository,
    private mealPlanRepo: MealPlanRepository,
    private inventoryRepo: InventoryRepository,
    private groceryRepo: GroceryRepository,
  ) {}

  async generateFromPlan(mealPlanId: string, subtractInventory = true) {
    const plan = await this.mealPlanRepo.getById(mealPlanId);
    if (!plan) throw new Error("Meal plan not found");

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

    // 4. Assign stores
    const items = Array.from(aggregated.values()).map((ing) => ({
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      category: ing.category,
      store: this.assignStore(ing),
      recipeId: ing.recipeIds[0],
    }));

    // 5. Create the list
    const list = await this.groceryRepo.create({
      name: plan.name,
      mealPlanId,
      items,
    });

    const fullList = await this.groceryRepo.getById(list.id);

    // 6. Calculate store breakdown
    const storeBreakdown: Record<string, { itemCount: number }> = {};
    for (const item of fullList!.items) {
      const store = item.store || "unassigned";
      if (!storeBreakdown[store]) storeBreakdown[store] = { itemCount: 0 };
      storeBreakdown[store].itemCount++;
    }

    return {
      list: fullList!,
      subtracted,
      storeBreakdown,
    };
  }

  private assignStore(ing: AggregatedIngredient): string {
    const nameLower = ing.name.toLowerCase();

    // Check if it's an Asian specialty
    if (ASIAN_SPECIALTY_KEYWORDS.some((kw) => nameLower.includes(kw))) {
      return "weee";
    }

    // Default to Wegmans
    return "wegmans";
  }
}
