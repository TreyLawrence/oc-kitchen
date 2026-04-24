import { InventoryRepository } from "../repositories/inventory.repo.js";
import { GroceryRepository } from "../repositories/grocery.repo.js";

const EXPIRATION_DAYS: Record<string, number> = {
  protein: 4,
  produce: 5,
  dairy: 10,
};

const PANTRY_LOCATIONS = new Set(["pantry", "spice"]);

interface SyncOptions {
  deliveryDate?: string; // YYYY-MM-DD, defaults to today
}

interface SyncResult {
  ok: boolean;
  added: number;
  items: Array<{ name: string; location: string; expiresAt: string | null }>;
  error?: string;
}

export class InventorySyncService {
  constructor(
    private inventoryRepo: InventoryRepository,
    private groceryRepo: GroceryRepository,
  ) {}

  async syncDelivery(groceryListId: string, options: SyncOptions = {}): Promise<SyncResult> {
    const list = await this.groceryRepo.getById(groceryListId);
    if (!list) {
      return { ok: false, added: 0, items: [], error: "Grocery list not found" };
    }

    const deliveryDate = options.deliveryDate || new Date().toISOString().split("T")[0];

    const inventoryItems = list.items.map((item: any) => {
      const category = item.category || null;
      const location = this.mapLocation(category);
      const expiresAt = this.estimateExpiration(category, deliveryDate);

      return {
        name: item.name,
        category,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        location,
        expiresAt,
        purchasedAt: deliveryDate,
      };
    });

    await this.inventoryRepo.add(inventoryItems);

    return {
      ok: true,
      added: inventoryItems.length,
      items: inventoryItems.map((i) => ({
        name: i.name,
        location: i.location,
        expiresAt: i.expiresAt,
      })),
    };
  }

  private mapLocation(category: string | null): string {
    if (category && PANTRY_LOCATIONS.has(category)) return "pantry";
    return "fridge";
  }

  private estimateExpiration(category: string | null, deliveryDate: string): string | null {
    if (!category || !(category in EXPIRATION_DAYS)) return null;

    const date = new Date(deliveryDate);
    date.setDate(date.getDate() + EXPIRATION_DAYS[category]);
    return date.toISOString().split("T")[0];
  }
}
