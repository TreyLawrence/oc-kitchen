import { eq } from "drizzle-orm";
import { userEquipment, userPreferences } from "../db/schema.js";
import { newId } from "../utils/ids.js";
import { now } from "../utils/dates.js";

type Db = Parameters<typeof eq> extends never ? never : any;

export class UserProfileRepository {
  constructor(private db: any) {}

  // ─── Equipment ─────────────────────────────────────────

  async addEquipment(
    items: Array<{ name: string; category?: string; notes?: string }>
  ) {
    const rows = items.map((item) => ({
      id: newId(),
      name: item.name,
      category: item.category ?? null,
      notes: item.notes ?? null,
      createdAt: now(),
    }));

    for (const row of rows) {
      this.db.insert(userEquipment).values(row).run();
    }

    return rows;
  }

  async removeEquipment(ids: string[]) {
    for (const id of ids) {
      this.db.delete(userEquipment).where(eq(userEquipment.id, id)).run();
    }
  }

  async listEquipment() {
    return this.db.select().from(userEquipment).all();
  }

  // ─── Preferences ───────────────────────────────────────

  async setPreference(key: string, value: unknown) {
    const jsonValue = JSON.stringify(value);
    const existing = this.db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.key, key))
      .get();

    if (existing) {
      this.db
        .update(userPreferences)
        .set({ value: jsonValue, updatedAt: now() })
        .where(eq(userPreferences.key, key))
        .run();
    } else {
      this.db
        .insert(userPreferences)
        .values({
          id: newId(),
          key,
          value: jsonValue,
          updatedAt: now(),
        })
        .run();
    }
  }

  async getPreference(key: string): Promise<unknown | null> {
    const row = this.db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.key, key))
      .get();

    if (!row) return null;
    return JSON.parse(row.value);
  }

  async getAllPreferences(): Promise<Record<string, unknown>> {
    const rows = this.db.select().from(userPreferences).all();
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      result[row.key] = JSON.parse(row.value);
    }
    return result;
  }

  // ─── Full Profile ──────────────────────────────────────

  async getFullProfile() {
    const equipment = await this.listEquipment();
    const preferences = await this.getAllPreferences();
    return { equipment, preferences };
  }
}
