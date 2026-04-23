import { GroceryRepository } from "../repositories/grocery.repo.js";

export function createUpdateGroceryListTool(repo: GroceryRepository) {
  return {
    name: "update_grocery_list",
    description:
      "Modify a grocery list — add/remove items, reassign stores, check items off, change status (draft → finalized → ordering → ordered).",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Grocery list ID" },
        status: { type: "string", enum: ["draft", "finalized", "ordering", "ordered"] },
        addItems: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string" },
              store: { type: "string", enum: ["wegmans", "weee", "butcherbox"] },
            },
            required: ["name"],
          },
        },
        removeItems: { type: "array", items: { type: "string" }, description: "Item IDs to remove" },
        updateItems: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              store: { type: "string" },
              isChecked: { type: "boolean" },
              quantity: { type: "number" },
            },
            required: ["id"],
          },
        },
      },
      required: ["id"],
    },
    handler: async (params: any, { respond }: any) => {
      try {
        const { id, ...updates } = params;
        await repo.update(id, updates);
        const list = await repo.getById(id);
        respond(true, { ok: true, list });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
