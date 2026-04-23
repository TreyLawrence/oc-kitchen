import { InventoryRepository } from "../repositories/inventory.repo.js";
import { RecipeRepository } from "../repositories/recipe.repo.js";

interface DeductionResult {
  deducted: Array<{
    ingredient: string;
    amount: string;
    inventoryItem: string;
    remaining: string;
    removed: boolean;
  }>;
  unmatched: Array<{
    ingredient: string;
    reason: string;
  }>;
}

export class InventoryDeductionService {
  constructor(
    private inventoryRepo: InventoryRepository,
    private recipeRepo: RecipeRepository
  ) {}

  async deductForRecipe(recipeId: string): Promise<DeductionResult> {
    const recipe = await this.recipeRepo.getById(recipeId);
    if (!recipe) throw new Error("Recipe not found");

    const deducted: DeductionResult["deducted"] = [];
    const unmatched: DeductionResult["unmatched"] = [];

    for (const ingredient of recipe.ingredients) {
      const match = await this.inventoryRepo.findByName(ingredient.name);

      if (!match) {
        unmatched.push({
          ingredient: ingredient.name,
          reason: "not found in inventory",
        });
        continue;
      }

      const amount = ingredient.quantity
        ? `${ingredient.quantity} ${ingredient.unit || ""}`.trim()
        : "some";

      // If inventory item has no quantity, we can't subtract — just note it was used
      if (match.quantity === null || ingredient.quantity === null) {
        deducted.push({
          ingredient: ingredient.name,
          amount,
          inventoryItem: match.name,
          remaining: "unknown",
          removed: false,
        });
        continue;
      }

      const remaining = match.quantity - ingredient.quantity;

      if (remaining <= 0) {
        // Remove the item
        await this.inventoryRepo.remove([match.id]);
        deducted.push({
          ingredient: ingredient.name,
          amount,
          inventoryItem: match.name,
          remaining: `0 ${match.unit || ""}`.trim(),
          removed: true,
        });
      } else {
        // Update the quantity
        await this.inventoryRepo.update([{ id: match.id, quantity: remaining }]);
        deducted.push({
          ingredient: ingredient.name,
          amount,
          inventoryItem: match.name,
          remaining: `${remaining} ${match.unit || ""}`.trim(),
          removed: false,
        });
      }
    }

    return { deducted, unmatched };
  }
}
