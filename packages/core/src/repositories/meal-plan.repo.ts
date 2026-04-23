import { eq, and, lte, gte, desc } from "drizzle-orm";
import { mealPlans, mealPlanEntries } from "../db/schema.js";
import { newId } from "../utils/ids.js";
import { now } from "../utils/dates.js";

interface EntryInput {
  dayOfWeek: number;
  mealType: string;
  recipeId?: string;
  customTitle?: string;
  category?: string;
  dependsOn?: string;
}

interface CreatePlanInput {
  name: string;
  weekStart: string;
  weekEnd: string;
  status?: string;
  notes?: string;
  entries: EntryInput[];
}

interface UpdatePlanInput {
  status?: string;
  notes?: string;
  addEntries?: EntryInput[];
  removeEntries?: string[];
  updateEntries?: Array<{ id: string; recipeId?: string; customTitle?: string; category?: string; dependsOn?: string }>;
}

export class MealPlanRepository {
  constructor(private db: any) {}

  async create(input: CreatePlanInput) {
    const id = newId();
    const timestamp = now();

    this.db.insert(mealPlans).values({
      id,
      name: input.name,
      weekStart: input.weekStart,
      weekEnd: input.weekEnd,
      status: input.status ?? "draft",
      notes: input.notes ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).run();

    for (let i = 0; i < input.entries.length; i++) {
      const entry = input.entries[i];
      this.db.insert(mealPlanEntries).values({
        id: newId(),
        mealPlanId: id,
        recipeId: entry.recipeId ?? null,
        dayOfWeek: entry.dayOfWeek,
        mealType: entry.mealType,
        customTitle: entry.customTitle ?? null,
        category: entry.category ?? null,
        dependsOn: entry.dependsOn ?? null,
        sortOrder: i,
      }).run();
    }

    return this.db.select().from(mealPlans).where(eq(mealPlans.id, id)).get()!;
  }

  async getById(id: string) {
    const plan = this.db.select().from(mealPlans).where(eq(mealPlans.id, id)).get();
    if (!plan) return null;

    const entries = this.db
      .select()
      .from(mealPlanEntries)
      .where(eq(mealPlanEntries.mealPlanId, id))
      .orderBy(mealPlanEntries.dayOfWeek, mealPlanEntries.sortOrder)
      .all();

    return { ...plan, entries };
  }

  async getCurrent(asOfDate?: string) {
    const date = asOfDate || new Date().toISOString().split("T")[0];

    const plan = this.db
      .select()
      .from(mealPlans)
      .where(
        and(
          eq(mealPlans.status, "active"),
          lte(mealPlans.weekStart, date),
          gte(mealPlans.weekEnd, date)
        )
      )
      .get();

    if (!plan) return null;
    return this.getById(plan.id);
  }

  async list() {
    return this.db
      .select()
      .from(mealPlans)
      .orderBy(desc(mealPlans.weekStart))
      .all();
  }

  async update(id: string, input: UpdatePlanInput) {
    const timestamp = now();

    // Update plan fields
    const planFields: any = { updatedAt: timestamp };
    if (input.status !== undefined) planFields.status = input.status;
    if (input.notes !== undefined) planFields.notes = input.notes;

    this.db.update(mealPlans).set(planFields).where(eq(mealPlans.id, id)).run();

    // Add entries
    if (input.addEntries?.length) {
      const existing = this.db
        .select()
        .from(mealPlanEntries)
        .where(eq(mealPlanEntries.mealPlanId, id))
        .all();
      const nextSort = existing.length;

      for (let i = 0; i < input.addEntries.length; i++) {
        const entry = input.addEntries[i];
        this.db.insert(mealPlanEntries).values({
          id: newId(),
          mealPlanId: id,
          recipeId: entry.recipeId ?? null,
          dayOfWeek: entry.dayOfWeek,
          mealType: entry.mealType,
          customTitle: entry.customTitle ?? null,
          category: entry.category ?? null,
          dependsOn: entry.dependsOn ?? null,
          sortOrder: nextSort + i,
        }).run();
      }
    }

    // Remove entries
    if (input.removeEntries?.length) {
      for (const entryId of input.removeEntries) {
        this.db.delete(mealPlanEntries).where(eq(mealPlanEntries.id, entryId)).run();
      }
    }

    // Update entries
    if (input.updateEntries?.length) {
      for (const update of input.updateEntries) {
        const { id: entryId, ...fields } = update;
        const data: any = {};
        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined) data[key] = value;
        }
        if (Object.keys(data).length > 0) {
          this.db.update(mealPlanEntries).set(data).where(eq(mealPlanEntries.id, entryId)).run();
        }
      }
    }
  }
}
