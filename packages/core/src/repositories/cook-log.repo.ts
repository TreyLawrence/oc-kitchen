import { eq, desc, sql } from "drizzle-orm";
import { cookLog, recipes } from "../db/schema.js";
import { newId } from "../utils/ids.js";
import { now } from "../utils/dates.js";

interface LogCookInput {
  recipeId: string;
  verdict?: "banger" | "make_again" | "try_again_with_tweaks" | "dont_make_again";
  notes?: string;
  modifications?: Array<{ original: string; modification: string }>;
  photos?: string[];
}

export class CookLogRepository {
  constructor(private db: any) {}

  async logCook(input: LogCookInput) {
    // Spec edge case: verdict requires a prior cook log
    if (input.verdict) {
      const prior = this.db
        .select({ id: cookLog.id })
        .from(cookLog)
        .where(eq(cookLog.recipeId, input.recipeId))
        .limit(1)
        .get();
      if (!prior) {
        throw new Error(
          "Cannot log a verdict for a recipe that has never been cooked. Log a cook first."
        );
      }
    }

    const id = newId();

    this.db
      .insert(cookLog)
      .values({
        id,
        recipeId: input.recipeId,
        verdict: input.verdict ?? null,
        notes: input.notes ?? null,
        modifications: input.modifications
          ? JSON.stringify(input.modifications)
          : null,
        photos: input.photos ? JSON.stringify(input.photos) : null,
        cookedAt: now(),
      })
      .run();

    // Update recipe-level verdict to match most recent cook (only if verdict provided)
    if (input.verdict) {
      this.db
        .update(recipes)
        .set({ verdict: input.verdict, updatedAt: now() })
        .where(eq(recipes.id, input.recipeId))
        .run();
    }

    return this.db.select().from(cookLog).where(eq(cookLog.id, id)).get()!;
  }

  async getHistory(recipeId: string) {
    return this.db
      .select()
      .from(cookLog)
      .where(eq(cookLog.recipeId, recipeId))
      .orderBy(desc(cookLog.cookedAt), desc(sql`rowid`))
      .all();
  }

  async getRecentLogsWithRecipes(limit = 20) {
    return this.db
      .select({
        id: cookLog.id,
        recipeId: cookLog.recipeId,
        verdict: cookLog.verdict,
        notes: cookLog.notes,
        modifications: cookLog.modifications,
        cookedAt: cookLog.cookedAt,
        recipeTitle: recipes.title,
        recipeTags: recipes.tags,
      })
      .from(cookLog)
      .innerJoin(recipes, eq(cookLog.recipeId, recipes.id))
      .orderBy(desc(cookLog.cookedAt), desc(sql`cook_log.rowid`))
      .limit(limit)
      .all();
  }

  async getTotalCount(): Promise<number> {
    const result = this.db
      .select({ count: sql<number>`count(*)` })
      .from(cookLog)
      .get();
    return result?.count ?? 0;
  }

  async getVerdictCount(): Promise<number> {
    const result = this.db
      .select({ count: sql<number>`count(*)` })
      .from(cookLog)
      .where(sql`${cookLog.verdict} IS NOT NULL`)
      .get();
    return result?.count ?? 0;
  }
}
