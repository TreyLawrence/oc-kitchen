import { CookLogRepository } from "../repositories/cook-log.repo.js";
import { UserProfileRepository } from "../repositories/user-profile.repo.js";

interface TriggerResult {
  shouldRegenerate: boolean;
  reason: string | null;
}

interface SummaryContext {
  recentLogs: Array<{
    recipeTitle: string;
    verdict: string;
    notes: string | null;
    modifications: string | null;
    tags: string[];
    cookedAt: string;
  }>;
  verdictCounts: Record<string, number>;
  currentSummary: string | null;
  instructions: string;
}

/**
 * Determines when the preference_summary should be regenerated
 * and gathers cook log context for the agent to synthesize.
 */
export class PreferenceSummaryService {
  constructor(
    private cookLogRepo: CookLogRepository,
    private profileRepo: UserProfileRepository
  ) {}

  /**
   * Check if a preference summary regeneration is needed based on a
   * just-logged cook entry. Called after log_cook.
   */
  async checkTrigger(verdict: string, recipeTags: string[]): Promise<TriggerResult> {
    const totalCount = await this.cookLogRepo.getVerdictCount();

    // Trigger: every 5th cook log
    if (totalCount > 0 && totalCount % 5 === 0) {
      return {
        shouldRegenerate: true,
        reason: `Cook log milestone: ${totalCount} total cooks logged`,
      };
    }

    // Trigger: "dont_make_again" verdict
    if (verdict === "dont_make_again") {
      return {
        shouldRegenerate: true,
        reason: "Negative verdict logged — update summary to learn what to avoid",
      };
    }

    // Trigger: first "banger" for a new cuisine
    if (verdict === "banger") {
      const isFirstBangerForCuisine = await this.isFirstBangerForAnyCuisine(recipeTags);
      if (isFirstBangerForCuisine) {
        return {
          shouldRegenerate: true,
          reason: "First banger in a new cuisine — update cuisine affinities",
        };
      }
    }

    return { shouldRegenerate: false, reason: null };
  }

  /**
   * Check if regeneration is needed before meal plan generation.
   * Returns true if the summary is stale (> 5 cooks since last update)
   * or missing entirely.
   */
  async checkStaleness(): Promise<TriggerResult> {
    const currentSummary = await this.profileRepo.getPreference("preference_summary");
    if (!currentSummary) {
      const totalCount = await this.cookLogRepo.getTotalCount();
      if (totalCount === 0) {
        return { shouldRegenerate: false, reason: null };
      }
      return {
        shouldRegenerate: true,
        reason: "No preference summary exists yet — generate one before meal planning",
      };
    }

    // Summary exists. Check if there have been enough new cooks to warrant refresh.
    // We check if total count is a different "5-block" than what the summary reflects.
    // Simpler: just always regenerate before meal plan if there are any logs.
    const totalCount = await this.cookLogRepo.getTotalCount();
    if (totalCount === 0) {
      return { shouldRegenerate: false, reason: null };
    }

    return {
      shouldRegenerate: true,
      reason: "Refreshing preference summary before meal plan generation",
    };
  }

  /**
   * Gather cook log context for the agent to synthesize into a preference summary.
   */
  async gatherContext(): Promise<SummaryContext> {
    const allLogs = await this.cookLogRepo.getRecentLogsWithRecipes(30);
    // Filter out verdict-free cook logs (initial "I cooked this" markers)
    const recentLogs = allLogs.filter((log: any) => log.verdict !== null);
    const currentSummary = (await this.profileRepo.getPreference("preference_summary")) as string | null;

    const verdictCounts: Record<string, number> = {};
    const formattedLogs = recentLogs.map((log: any) => {
      verdictCounts[log.verdict] = (verdictCounts[log.verdict] || 0) + 1;

      let tags: string[] = [];
      if (log.recipeTags) {
        try {
          tags = JSON.parse(log.recipeTags);
        } catch {
          tags = [];
        }
      }

      return {
        recipeTitle: log.recipeTitle,
        verdict: log.verdict,
        notes: log.notes,
        modifications: log.modifications,
        tags,
        cookedAt: log.cookedAt,
      };
    });

    return {
      recentLogs: formattedLogs,
      verdictCounts,
      currentSummary,
      instructions: [
        "Synthesize the cook log data above into a concise preference summary.",
        "Identify patterns: cuisine affinities, flavor preferences, common modifications,",
        "ingredients they love or avoid, cooking styles they gravitate toward.",
        "Note any strong reactions (bangers = loves it, dont_make_again = avoid).",
        "Keep it to 2-4 sentences — this will be passed as context for recipe generation",
        "and meal planning. Store the result via update_user_profile with key 'preference_summary'.",
      ].join(" "),
    };
  }

  private async isFirstBangerForAnyCuisine(recipeTags: string[]): Promise<boolean> {
    if (!recipeTags.length) return false;

    // Get all banger cook logs with their recipe tags
    const allLogs = await this.cookLogRepo.getRecentLogsWithRecipes(100);
    const bangerLogs = allLogs.filter((log: any) => log.verdict === "banger");

    // Build a set of cuisines that already have bangers (excluding the current cook,
    // which is the most recent one)
    const existingBangerCuisines = new Set<string>();
    for (const log of bangerLogs.slice(1) as any[]) {
      if (log.recipeTags) {
        try {
          const tags: string[] = JSON.parse(log.recipeTags);
          for (const tag of tags) {
            existingBangerCuisines.add(tag.toLowerCase());
          }
        } catch {
          // skip
        }
      }
    }

    // Check if any of the current recipe's tags are new to the banger set
    for (const tag of recipeTags) {
      if (!existingBangerCuisines.has(tag.toLowerCase())) {
        return true;
      }
    }

    return false;
  }
}
