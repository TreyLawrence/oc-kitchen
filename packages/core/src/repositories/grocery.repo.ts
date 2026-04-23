import { eq, desc } from "drizzle-orm";
import { groceryLists, groceryItems } from "../db/schema.js";
import { newId } from "../utils/ids.js";
import { now } from "../utils/dates.js";

interface ItemInput {
  name: string;
  quantity?: number;
  unit?: string;
  category?: string;
  store?: string;
  recipeId?: string;
}

interface CreateListInput {
  name: string;
  mealPlanId?: string;
  items: ItemInput[];
}

interface UpdateListInput {
  status?: string;
  addItems?: ItemInput[];
  removeItems?: string[];
  updateItems?: Array<{ id: string; store?: string; isChecked?: boolean; quantity?: number }>;
}

export class GroceryRepository {
  constructor(private db: any) {}

  async create(input: CreateListInput) {
    const id = newId();
    const timestamp = now();

    this.db.insert(groceryLists).values({
      id,
      mealPlanId: input.mealPlanId ?? null,
      name: input.name,
      status: "draft",
      createdAt: timestamp,
      updatedAt: timestamp,
    }).run();

    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i];
      this.db.insert(groceryItems).values({
        id: newId(),
        groceryListId: id,
        name: item.name,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        category: item.category ?? null,
        store: item.store ?? null,
        isChecked: false,
        recipeId: item.recipeId ?? null,
        sortOrder: i,
      }).run();
    }

    return this.db.select().from(groceryLists).where(eq(groceryLists.id, id)).get()!;
  }

  async getById(id: string) {
    const list = this.db.select().from(groceryLists).where(eq(groceryLists.id, id)).get();
    if (!list) return null;

    const items = this.db
      .select()
      .from(groceryItems)
      .where(eq(groceryItems.groceryListId, id))
      .orderBy(groceryItems.sortOrder)
      .all();

    return { ...list, items };
  }

  async list() {
    return this.db.select().from(groceryLists).orderBy(desc(groceryLists.createdAt)).all();
  }

  async update(id: string, input: UpdateListInput) {
    const timestamp = now();

    if (input.status) {
      this.db.update(groceryLists).set({ status: input.status, updatedAt: timestamp }).where(eq(groceryLists.id, id)).run();
    }

    if (input.addItems?.length) {
      const existing = this.db.select().from(groceryItems).where(eq(groceryItems.groceryListId, id)).all();
      const nextSort = existing.length;

      for (let i = 0; i < input.addItems.length; i++) {
        const item = input.addItems[i];
        this.db.insert(groceryItems).values({
          id: newId(),
          groceryListId: id,
          name: item.name,
          quantity: item.quantity ?? null,
          unit: item.unit ?? null,
          category: item.category ?? null,
          store: item.store ?? null,
          isChecked: false,
          recipeId: item.recipeId ?? null,
          sortOrder: nextSort + i,
        }).run();
      }
    }

    if (input.removeItems?.length) {
      for (const itemId of input.removeItems) {
        this.db.delete(groceryItems).where(eq(groceryItems.id, itemId)).run();
      }
    }

    if (input.updateItems?.length) {
      for (const update of input.updateItems) {
        const { id: itemId, ...fields } = update;
        const data: any = {};
        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined) data[key] = value;
        }
        if (Object.keys(data).length > 0) {
          this.db.update(groceryItems).set(data).where(eq(groceryItems.id, itemId)).run();
        }
      }
    }
  }
}
