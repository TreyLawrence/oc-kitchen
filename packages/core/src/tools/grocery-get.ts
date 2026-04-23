import { GroceryRepository } from "../repositories/grocery.repo.js";

export function createGetGroceryListTool(repo: GroceryRepository) {
  return {
    name: "get_grocery_list",
    description:
      "Get a grocery list with all items, or list all grocery lists.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Grocery list ID" },
      },
    },
    handler: async (params: any, { respond }: any) => {
      try {
        if (params.id) {
          const list = await repo.getById(params.id);
          if (!list) {
            respond(false, { ok: false, error: "Grocery list not found" });
            return;
          }
          respond(true, { ok: true, list });
        } else {
          const lists = await repo.list();
          respond(true, { ok: true, lists });
        }
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
