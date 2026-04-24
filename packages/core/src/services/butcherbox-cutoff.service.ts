import { UserProfileRepository } from "../repositories/user-profile.repo.js";
import { MealPlanRepository } from "../repositories/meal-plan.repo.js";
import { RecipeRepository } from "../repositories/recipe.repo.js";

const BUTCHERBOX_PROTEINS = [
  "chicken", "beef", "pork", "salmon", "steak",
  "ground beef", "ground turkey", "turkey", "bacon", "sausage",
  "lamb", "chicken breast", "chicken thigh",
  "pork chop", "pork tenderloin",
  "ribeye", "sirloin", "brisket", "short rib",
];

const REMINDER_DAYS = 3;

export type CutoffStatus = "not_subscribed" | "no_cutoff_set" | "upcoming" | "past" | "ok";

export interface CutoffCheckResult {
  status: CutoffStatus;
  cutoffDate?: string;
  deliveryDate?: string;
  daysUntilCutoff?: number;
  mealPlanProteins?: Array<{
    mealPlanId: string;
    mealPlanName: string;
    proteins: Array<{ name: string; recipeTitle: string }>;
  }>;
}

export class ButcherBoxCutoffService {
  constructor(
    private profileRepo: UserProfileRepository,
    private mealPlanRepo: MealPlanRepository,
    private recipeRepo: RecipeRepository,
  ) {}

  async checkCutoff(today?: string): Promise<CutoffCheckResult> {
    const hasSubscription = await this.profileRepo.getPreference("butcherbox_subscription");
    if (!hasSubscription) {
      return { status: "not_subscribed" };
    }

    const cutoffDate = await this.profileRepo.getPreference("butcherbox_cutoff_date") as string | null;
    if (!cutoffDate) {
      return { status: "no_cutoff_set" };
    }

    const deliveryDate = await this.profileRepo.getPreference("butcherbox_delivery_date") as string | null;

    const todayDate = today ?? new Date().toISOString().split("T")[0];
    const diffMs = new Date(cutoffDate).getTime() - new Date(todayDate).getTime();
    const daysUntilCutoff = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysUntilCutoff < 0) {
      return {
        status: "past",
        cutoffDate,
        deliveryDate: deliveryDate ?? undefined,
        daysUntilCutoff,
      };
    }

    if (daysUntilCutoff > REMINDER_DAYS) {
      return {
        status: "ok",
        cutoffDate,
        deliveryDate: deliveryDate ?? undefined,
        daysUntilCutoff,
      };
    }

    // Upcoming — find meal plan proteins
    const mealPlanProteins = await this.findMealPlanProteins();

    return {
      status: "upcoming",
      cutoffDate,
      deliveryDate: deliveryDate ?? undefined,
      daysUntilCutoff,
      mealPlanProteins,
    };
  }

  private async findMealPlanProteins(): Promise<CutoffCheckResult["mealPlanProteins"]> {
    const allPlans = (await this.mealPlanRepo.list())
      .filter((p: any) => p.status === "draft" || p.status === "active");

    const results: NonNullable<CutoffCheckResult["mealPlanProteins"]> = [];

    for (const plan of allPlans) {
      const fullPlan = await this.mealPlanRepo.getById(plan.id);
      if (!fullPlan) continue;

      const proteins: Array<{ name: string; recipeTitle: string }> = [];

      for (const entry of fullPlan.entries) {
        if (!entry.recipeId || entry.category === "leftover" || entry.category === "skip") continue;

        const recipe = await this.recipeRepo.getById(entry.recipeId);
        if (!recipe) continue;

        for (const ing of recipe.ingredients) {
          if (ing.category !== "protein") continue;
          const nameLower = ing.name.toLowerCase();
          if (BUTCHERBOX_PROTEINS.some((p) => nameLower.includes(p))) {
            proteins.push({ name: ing.name, recipeTitle: recipe.title });
          }
        }
      }

      if (proteins.length > 0) {
        results.push({
          mealPlanId: plan.id,
          mealPlanName: plan.name,
          proteins,
        });
      }
    }

    return results;
  }
}
