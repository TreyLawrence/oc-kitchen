import { OrderRepository } from "../repositories/order.repo.js";

export function createGetOrderTool(orderRepo: OrderRepository) {
  return {
    name: "get_order",
    description:
      "Get a specific order by ID, list orders for a grocery list, or list all orders.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Order ID" },
        groceryListId: {
          type: "string",
          description: "Filter orders by grocery list ID",
        },
      },
    },
    handler: async (params: any, { respond }: any) => {
      try {
        if (params.id) {
          const order = await orderRepo.getById(params.id);
          if (!order) {
            respond(false, { ok: false, error: "Order not found" });
            return;
          }
          respond(true, { ok: true, order });
        } else if (params.groceryListId) {
          const orders = await orderRepo.getByGroceryListId(
            params.groceryListId,
          );
          respond(true, { ok: true, orders });
        } else {
          const orders = await orderRepo.list();
          respond(true, { ok: true, orders });
        }
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
