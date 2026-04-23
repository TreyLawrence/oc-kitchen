import { eq, and, like, lte, sql, desc } from "drizzle-orm";
import { inventoryItems } from "../db/schema.js";
import { newId } from "../utils/ids.js";
import { now } from "../utils/dates.js";

interface AddItemInput {
  name: string;
  category?: string;
  quantity?: number;
  unit?: string;
  location?: string;
  expiresAt?: string;
  purchasedAt?: string;
  notes?: string;
}

interface ListInput {
  location?: string;
  category?: string;
  query?: string;
  expiringSoon?: boolean;
  asOfDate?: string; // For testing — override "today"
}

interface UpdateItemInput {
  id: string;
  name?: string;
  category?: string;
  quantity?: number;
  unit?: string;
  location?: string;
  expiresAt?: string;
  notes?: string;
}

export class InventoryRepository {
  constructor(private db: any) {}

  async add(items: AddItemInput[]) {
    const timestamp = now();
    const rows = items.map((item) => ({
      id: newId(),
      name: item.name,
      category: item.category ?? null,
      quantity: item.quantity ?? null,
      unit: item.unit ?? null,
      location: item.location ?? null,
      expiresAt: item.expiresAt ?? null,
      purchasedAt: item.purchasedAt ?? timestamp.split("T")[0],
      notes: item.notes ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));

    for (const row of rows) {
      this.db.insert(inventoryItems).values(row).run();
    }

    return rows.map((r) =>
      this.db.select().from(inventoryItems).where(eq(inventoryItems.id, r.id)).get()!
    );
  }

  async list(input: ListInput) {
    const conditions: any[] = [];

    if (input.location) {
      conditions.push(eq(inventoryItems.location, input.location));
    }
    if (input.category) {
      conditions.push(eq(inventoryItems.category, input.category));
    }
    if (input.query) {
      conditions.push(like(inventoryItems.name, `%${input.query}%`));
    }
    if (input.expiringSoon) {
      const today = input.asOfDate || new Date().toISOString().split("T")[0];
      const threeDaysLater = new Date(today);
      threeDaysLater.setDate(threeDaysLater.getDate() + 3);
      const cutoff = threeDaysLater.toISOString().split("T")[0];

      conditions.push(sql`${inventoryItems.expiresAt} IS NOT NULL`);
      conditions.push(lte(inventoryItems.expiresAt, cutoff));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const items = where
      ? this.db.select().from(inventoryItems).where(where).orderBy(desc(inventoryItems.createdAt)).all()
      : this.db.select().from(inventoryItems).orderBy(desc(inventoryItems.createdAt)).all();

    // Count expiring items (always, regardless of filters)
    const today = input.asOfDate || new Date().toISOString().split("T")[0];
    const threeDaysLater = new Date(today);
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    const cutoff = threeDaysLater.toISOString().split("T")[0];

    const expiringResult = this.db
      .select({ count: sql<number>`count(*)` })
      .from(inventoryItems)
      .where(
        and(
          sql`${inventoryItems.expiresAt} IS NOT NULL`,
          lte(inventoryItems.expiresAt, cutoff)
        )
      )
      .get();

    return {
      items,
      expiringCount: expiringResult?.count ?? 0,
    };
  }

  async update(updates: UpdateItemInput[]) {
    const timestamp = now();
    for (const update of updates) {
      const { id, ...fields } = update;
      const data: any = { updatedAt: timestamp };
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) data[key] = value;
      }
      this.db.update(inventoryItems).set(data).where(eq(inventoryItems.id, id)).run();
    }
  }

  async remove(ids: string[]) {
    for (const id of ids) {
      this.db.delete(inventoryItems).where(eq(inventoryItems.id, id)).run();
    }
  }

  /**
   * Fuzzy match an inventory item by name.
   * Tries exact match first, then LIKE %name%.
   */
  async findByName(name: string) {
    // Exact match
    const exact = this.db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.name, name))
      .get();
    if (exact) return exact;

    // Fuzzy — inventory name contains search term or vice versa
    const fuzzy = this.db
      .select()
      .from(inventoryItems)
      .where(like(inventoryItems.name, `%${name}%`))
      .get();
    if (fuzzy) return fuzzy;

    // Try the other direction — search term contains inventory name
    const all = this.db.select().from(inventoryItems).all();
    for (const item of all) {
      if (name.toLowerCase().includes(item.name.toLowerCase())) {
        return item;
      }
    }

    return null;
  }

  /**
   * Get items that haven't been updated recently (for staleness check).
   * Returns items grouped by confidence level.
   */
  async getStaleItems(asOfDate?: string) {
    const today = asOfDate || new Date().toISOString().split("T")[0];
    const allItems = this.db.select().from(inventoryItems).all();

    const confident: any[] = [];
    const needsCheck: any[] = [];

    for (const item of allItems) {
      const updatedDate = item.updatedAt.split("T")[0];
      const daysSinceUpdate = Math.floor(
        (new Date(today).getTime() - new Date(updatedDate).getTime()) / (1000 * 60 * 60 * 24)
      );

      const isPerishable = ["protein", "produce", "dairy"].includes(item.category || "");
      const staleThreshold = isPerishable ? 5 : 30;

      if (daysSinceUpdate >= staleThreshold) {
        needsCheck.push({
          ...item,
          daysSinceUpdate,
          reason: isPerishable
            ? `not updated in ${daysSinceUpdate} days, perishable`
            : `not updated in ${daysSinceUpdate} days`,
        });
      } else {
        confident.push({
          ...item,
          daysSinceUpdate,
          status: "likely accurate",
        });
      }
    }

    return { confident, needsCheck };
  }
}
