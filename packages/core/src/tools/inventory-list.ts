import { InventoryRepository } from "../repositories/inventory.repo.js";

export function createListInventoryTool(repo: InventoryRepository) {
  return {
    name: "list_inventory",
    description:
      "List items currently in the kitchen — fridge, freezer, and pantry. Filter by location, category, expiring soon, or search by name.",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string", enum: ["fridge", "freezer", "pantry"], description: "Filter by storage location" },
        category: { type: "string", enum: ["protein", "produce", "dairy", "pantry", "spice", "other"], description: "Filter by category" },
        expiringSoon: { type: "boolean", description: "Only show items expiring within 3 days" },
        query: { type: "string", description: "Search by item name" },
      },
    },
    handler: async (params: any, { respond }: any) => {
      try {
        const result = await repo.list(params);
        respond(true, { ok: true, ...result });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
