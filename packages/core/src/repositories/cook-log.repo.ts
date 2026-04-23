import { eq, desc, sql } from "drizzle-orm";
import { cookLog, recipes } from "../db/schema.js";
import { newId } from "../utils/ids.js";
import { now } from "../utils/dates.js";

interface LogCookInput {
  recipeId: string;
  verdict: "banger" | "make_again" | "try_again_with_tweaks" | "dont_make_again";
  notes?: string;
  modifications?: Array<{ original: string; modification: string }>;
  photos?: string[];
}

export class CookLogRepository {
  constructor(private db: any) {}

  async logCook(input: LogCookInput) {
    const id = newId();

    this.db
      .insert(cookLog)
      .values({
        id,
        recipeId: input.recipeId,
        verdict: input.verdict,
        notes: input.notes ?? null,
        modifications: input.modifications
          ? JSON.stringify(input.modifications)
          : null,
        photos: input.photos ? JSON.stringify(input.photos) : null,
        cookedAt: now(),
      })
      .run();

    // Update recipe-level verdict to match most recent cook
    this.db
      .update(recipes)
      .set({ verdict: input.verdict, updatedAt: now() })
      .where(eq(recipes.id, input.recipeId))
      .run();

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
}
