import { eq } from "drizzle-orm";
import { userEquipment, userPreferences } from "../db/schema.js";
import { newId } from "../utils/ids.js";
import { now } from "../utils/dates.js";

type Db = Parameters<typeof eq> extends never ? never : any;

// Canonical equipment names with their default categories.
// Keys are lowercase for case-insensitive matching.
const EQUIPMENT_ALIASES: Record<string, { name: string; category: string }> = {
  // Abbreviations
  "bge": { name: "Big Green Egg", category: "grill" },
  "ip": { name: "Instant Pot", category: "appliance" },
  "kj": { name: "Kamado Joe", category: "grill" },
  "fp": { name: "food processor", category: "appliance" },
  "ib": { name: "immersion blender", category: "appliance" },
  // Full names (for casing normalization)
  "big green egg": { name: "Big Green Egg", category: "grill" },
  "kamado joe": { name: "Kamado Joe", category: "grill" },
  "instant pot": { name: "Instant Pot", category: "appliance" },
  "king kooker": { name: "King Kooker", category: "outdoor" },
  "kitchenaid": { name: "KitchenAid", category: "appliance" },
  "zojirushi": { name: "Zojirushi", category: "appliance" },
  "le creuset": { name: "Le Creuset", category: "cookware" },
  "lodge": { name: "Lodge", category: "cookware" },
  "thermapen": { name: "Thermapen", category: "tool" },
};

function normalizeEquipment(item: { name: string; category?: string; notes?: string }) {
  const match = EQUIPMENT_ALIASES[item.name.toLowerCase()];
  if (!match) return item;
  return {
    ...item,
    name: match.name,
    category: item.category ?? match.category,
  };
}

export class UserProfileRepository {
  constructor(private db: any) {}

  // ─── Equipment ─────────────────────────────────────────

  async addEquipment(
    items: Array<{ name: string; category?: string; notes?: string }>
  ) {
    const rows = items.map((item) => {
      const normalized = normalizeEquipment(item);
      return {
        id: newId(),
        name: normalized.name,
        category: normalized.category ?? null,
        notes: normalized.notes ?? null,
        createdAt: now(),
      };
    });

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
