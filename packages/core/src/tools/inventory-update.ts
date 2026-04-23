import { InventoryRepository } from "../repositories/inventory.repo.js";

export function createUpdateInventoryTool(repo: InventoryRepository) {
  return {
    name: "update_inventory",
    description:
      "Add, remove, or modify kitchen inventory items. Supports batch operations.",
    parameters: {
      type: "object",
      properties: {
        add: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              category: { type: "string", enum: ["protein", "produce", "dairy", "pantry", "spice", "other"] },
              quantity: { type: "number" },
              unit: { type: "string" },
              location: { type: "string", enum: ["fridge", "freezer", "pantry"] },
              expiresAt: { type: "string", description: "Expiration date (YYYY-MM-DD)" },
              notes: { type: "string" },
            },
            required: ["name"],
          },
        },
        remove: { type: "array", items: { type: "string" }, description: "Item IDs to remove" },
        update: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              quantity: { type: "number" },
              location: { type: "string" },
              expiresAt: { type: "string" },
              notes: { type: "string" },
            },
            required: ["id"],
          },
        },
      },
    },
    handler: async (params: any, { respond }: any) => {
      try {
        let added = 0, removed = 0, updated = 0;

        if (params.add?.length) {
          await repo.add(params.add);
          added = params.add.length;
        }
        if (params.remove?.length) {
          await repo.remove(params.remove);
          removed = params.remove.length;
        }
        if (params.update?.length) {
          await repo.update(params.update);
          updated = params.update.length;
        }

        respond(true, { ok: true, added, removed, updated });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
