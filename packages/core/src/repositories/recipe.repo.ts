import { eq, like, and, desc, sql } from "drizzle-orm";
import { recipes, recipeIngredients } from "../db/schema.js";
import { newId } from "../utils/ids.js";
import { now } from "../utils/dates.js";

interface CreateRecipeInput {
  title: string;
  source: "manual" | "imported" | "ai_generated";
  instructions: string;
  description?: string;
  sourceUrl?: string;
  servings?: number;
  prepMinutes?: number;
  cookMinutes?: number;
  tags?: string[];
  notes?: string;
  imageUrl?: string;
  ingredients?: Array<{
    name: string;
    quantity?: number;
    unit?: string;
    category?: string;
  }>;
}

interface SearchInput {
  query?: string;
  source?: string;
  verdict?: string;
  favorite?: boolean;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export class RecipeRepository {
  constructor(private db: any) {}

  async create(input: CreateRecipeInput) {
    const id = newId();
    const timestamp = now();

    this.db
      .insert(recipes)
      .values({
        id,
        title: input.title,
        description: input.description ?? null,
        source: input.source,
        sourceUrl: input.sourceUrl ?? null,
        servings: input.servings ?? null,
        prepMinutes: input.prepMinutes ?? null,
        cookMinutes: input.cookMinutes ?? null,
        instructions: input.instructions,
        verdict: null,
        isFavorite: false,
        tags: input.tags ? JSON.stringify(input.tags) : null,
        notes: input.notes ?? null,
        imageUrl: input.imageUrl ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    if (input.ingredients?.length) {
      for (let i = 0; i < input.ingredients.length; i++) {
        const ing = input.ingredients[i];
        this.db
          .insert(recipeIngredients)
          .values({
            id: newId(),
            recipeId: id,
            name: ing.name,
            quantity: ing.quantity ?? null,
            unit: ing.unit ?? null,
            category: ing.category ?? null,
            sortOrder: i,
          })
          .run();
      }
    }

    return this.db.select().from(recipes).where(eq(recipes.id, id)).get()!;
  }

  async findBySourceUrl(url: string) {
    // Normalize trailing slashes for comparison
    const normalized = url.replace(/\/+$/, "");
    const row = this.db
      .select()
      .from(recipes)
      .where(sql`RTRIM(${recipes.sourceUrl}, '/') = ${normalized}`)
      .get();
    return row ?? null;
  }

  async getById(id: string) {
    const recipe = this.db.select().from(recipes).where(eq(recipes.id, id)).get();
    if (!recipe) return null;

    const ingredients = this.db
      .select()
      .from(recipeIngredients)
      .where(eq(recipeIngredients.recipeId, id))
      .orderBy(recipeIngredients.sortOrder)
      .all();

    return { ...recipe, ingredients };
  }

  async search(input: SearchInput) {
    const limit = input.limit ?? 20;
    const offset = input.offset ?? 0;

    // Build conditions
    const conditions: any[] = [];

    if (input.query) {
      const pattern = `%${input.query}%`;
      conditions.push(
        sql`(${recipes.title} LIKE ${pattern} OR ${recipes.tags} LIKE ${pattern})`
      );
    }

    if (input.source) {
      conditions.push(eq(recipes.source, input.source));
    }

    if (input.verdict) {
      conditions.push(eq(recipes.verdict, input.verdict));
    }

    if (input.favorite) {
      conditions.push(eq(recipes.isFavorite, true));
    }

    if (input.tags?.length) {
      for (const tag of input.tags) {
        conditions.push(sql`${recipes.tags} LIKE ${`%"${tag}"%`}`);
      }
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Count total
    const countResult = where
      ? this.db.select({ count: sql<number>`count(*)` }).from(recipes).where(where).get()
      : this.db.select({ count: sql<number>`count(*)` }).from(recipes).get();
    const total = countResult?.count ?? 0;

    // Fetch page
    let query = this.db
      .select()
      .from(recipes)
      .orderBy(desc(recipes.createdAt))
      .limit(limit)
      .offset(offset);

    if (where) {
      query = query.where(where);
    }

    const results = query.all();

    return { recipes: results, total };
  }

  async update(id: string, fields: Partial<{
    title: string;
    description: string;
    servings: number;
    prepMinutes: number;
    cookMinutes: number;
    instructions: string;
    verdict: string;
    isFavorite: boolean;
    tags: string[];
    notes: string;
    imageUrl: string;
  }>) {
    const updateData: any = { updatedAt: now() };

    for (const [key, value] of Object.entries(fields)) {
      if (key === "tags") {
        updateData.tags = JSON.stringify(value);
      } else {
        updateData[key] = value;
      }
    }

    this.db.update(recipes).set(updateData).where(eq(recipes.id, id)).run();
  }

  async delete(id: string): Promise<boolean> {
    const existing = this.db.select().from(recipes).where(eq(recipes.id, id)).get();
    if (!existing) return false;

    this.db.delete(recipes).where(eq(recipes.id, id)).run();
    return true;
  }
}
