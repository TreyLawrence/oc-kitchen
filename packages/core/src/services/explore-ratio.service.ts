import { CookLogRepository } from "../repositories/cook-log.repo.js";
import { UserProfileRepository } from "../repositories/user-profile.repo.js";

const MIN_EXPLORE_COOKS = 3;
const RECENT_WINDOW = 10;
const NUDGE_STEP = 0.05;
const POSITIVE_THRESHOLD = 0.7;
const NEGATIVE_THRESHOLD = 0.3;
const MIN_RATIO = 0.10;
const MAX_RATIO = 0.70;
const DEFAULT_RATIO = 0.3;

export interface AdaptationResult {
  adapted: boolean;
  oldRatio: number;
  newRatio: number;
  reason: string;
}

/**
 * Automatically adjusts the explore_ratio based on how users rate
 * "explore" recipes (first-time cooks). Called after each log_cook.
 *
 * Spec: specs/meal-planning/weekly-plan.md — Rule 5
 */
export class ExploreRatioService {
  constructor(
    private cookLogRepo: CookLogRepository,
    private profileRepo: UserProfileRepository
  ) {}

  async checkAdaptation(): Promise<AdaptationResult> {
    const currentRatio =
      ((await this.profileRepo.getPreference("explore_ratio")) as number) ??
      DEFAULT_RATIO;

    // Get recent cook logs and identify explore cooks (first cook per recipe)
    const allLogs = await this.cookLogRepo.getRecentLogsWithRecipes(100);

    // Walk from oldest to newest to find first cook per recipe
    const firstCookByRecipe = new Map<
      string,
      { verdict: string; cookedAt: string }
    >();
    for (const log of [...allLogs].reverse()) {
      if (!firstCookByRecipe.has(log.recipeId)) {
        firstCookByRecipe.set(log.recipeId, {
          verdict: log.verdict,
          cookedAt: log.cookedAt,
        });
      }
    }

    // Take the most recent explore cooks (up to RECENT_WINDOW)
    const exploreCooks = [...firstCookByRecipe.values()]
      .sort((a, b) => b.cookedAt.localeCompare(a.cookedAt))
      .slice(0, RECENT_WINDOW);

    if (exploreCooks.length < MIN_EXPLORE_COOKS) {
      return {
        adapted: false,
        oldRatio: currentRatio,
        newRatio: currentRatio,
        reason: `Not enough explore cooks yet (${exploreCooks.length}/${MIN_EXPLORE_COOKS})`,
      };
    }

    // Count positive vs negative (ignore try_again_with_tweaks)
    let positive = 0;
    let negative = 0;
    for (const cook of exploreCooks) {
      if (cook.verdict === "banger" || cook.verdict === "make_again") {
        positive++;
      } else if (cook.verdict === "dont_make_again") {
        negative++;
      }
    }

    const scoreable = positive + negative;
    if (scoreable === 0) {
      return {
        adapted: false,
        oldRatio: currentRatio,
        newRatio: currentRatio,
        reason: "No scoreable explore cooks (all try_again_with_tweaks)",
      };
    }

    const positiveRate = positive / scoreable;
    let newRatio = currentRatio;

    if (positiveRate >= POSITIVE_THRESHOLD) {
      newRatio = Math.min(currentRatio + NUDGE_STEP, MAX_RATIO);
    } else if (positiveRate <= NEGATIVE_THRESHOLD) {
      newRatio = Math.max(currentRatio - NUDGE_STEP, MIN_RATIO);
    }

    // Round to avoid floating-point drift
    newRatio = Math.round(newRatio * 100) / 100;

    if (newRatio === currentRatio) {
      return {
        adapted: false,
        oldRatio: currentRatio,
        newRatio: currentRatio,
        reason:
          positiveRate >= POSITIVE_THRESHOLD || positiveRate <= NEGATIVE_THRESHOLD
            ? "Ratio already at bound"
            : `Mixed sentiment (${Math.round(positiveRate * 100)}% positive) — no change`,
      };
    }

    // Persist the new ratio
    await this.profileRepo.setPreference("explore_ratio", newRatio);

    const direction = newRatio > currentRatio ? "increased" : "decreased";
    return {
      adapted: true,
      oldRatio: currentRatio,
      newRatio,
      reason: `Explore ratio ${direction} from ${Math.round(currentRatio * 100)}% to ${Math.round(newRatio * 100)}% — ${Math.round(positiveRate * 100)}% of recent new recipes rated positively`,
    };
  }
}
