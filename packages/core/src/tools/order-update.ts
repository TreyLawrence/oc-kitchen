import { OrderRepository } from "../repositories/order.repo.js";
import { now } from "../utils/dates.js";

const VALID_STATUSES = [
  "pending",
  "agent_running",
  "submitted",
  "failed",
  "delivered",
];

export function createUpdateOrderTool(orderRepo: OrderRepository) {
  return {
    name: "update_order",
    description:
      "Update a grocery order's status, total, or error message. Used by store plugins to report ordering progress and results.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Order ID" },
        status: {
          type: "string",
          enum: VALID_STATUSES,
          description: "New order status",
        },
        orderTotal: {
          type: "number",
          description: "Total order amount in dollars",
        },
        errorMessage: {
          type: "string",
          description: "Error message if the order failed",
        },
      },
      required: ["id"],
    },
    handler: async (params: any, { respond }: any) => {
      try {
        const order = await orderRepo.getById(params.id);
        if (!order) {
          respond(false, { ok: false, error: "Order not found" });
          return;
        }

        const updates: any = {};
        if (params.status !== undefined) updates.status = params.status;
        if (params.orderTotal !== undefined)
          updates.orderTotal = params.orderTotal;
        if (params.errorMessage !== undefined)
          updates.errorMessage = params.errorMessage;

        // Auto-set completedAt when reaching a terminal status
        if (
          params.status === "submitted" ||
          params.status === "failed" ||
          params.status === "delivered"
        ) {
          updates.completedAt = now();
        }

        await orderRepo.update(params.id, updates);
        const updated = await orderRepo.getById(params.id);

        respond(true, { ok: true, order: updated });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
