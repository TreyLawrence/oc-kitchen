import { OrderRepository } from "../repositories/order.repo.js";
import { GroceryRepository } from "../repositories/grocery.repo.js";
import { now } from "../utils/dates.js";

const STORE_MINIMUMS: Record<string, number> = {
  weee: 35,
};

const VALID_STORES = ["instacart", "weee", "butcherbox"];

export function createStartOrderTool(
  orderRepo: OrderRepository,
  groceryRepo: GroceryRepository,
) {
  return {
    name: "start_order",
    description:
      "Start a grocery order for a specific store from a finalized grocery list. Creates the order record and sets status to agent_running. Enforces one order per store per list and minimum order amounts.",
    parameters: {
      type: "object",
      properties: {
        groceryListId: {
          type: "string",
          description: "The grocery list to order from",
        },
        store: {
          type: "string",
          enum: VALID_STORES,
          description: "Which store to order from",
        },
        agentRunId: {
          type: "string",
          description: "Agent run ID for correlating with the ordering agent",
        },
      },
      required: ["groceryListId", "store"],
    },
    handler: async (params: any, { respond }: any) => {
      try {
        const { groceryListId, store, agentRunId } = params;

        // Validate the grocery list exists and is finalized
        const list = await groceryRepo.getById(groceryListId);
        if (!list) {
          respond(false, { ok: false, error: "Grocery list not found" });
          return;
        }
        if (list.status !== "finalized" && list.status !== "ordering") {
          respond(false, {
            ok: false,
            error: `Grocery list must be finalized before ordering (current status: ${list.status})`,
          });
          return;
        }

        // One order per store per list
        const existing = await orderRepo.getByGroceryListAndStore(
          groceryListId,
          store,
        );
        if (existing) {
          respond(false, {
            ok: false,
            error: `An order for ${store} already exists for this grocery list (order ${existing.id}, status: ${existing.status})`,
          });
          return;
        }

        // Check minimum order amount
        const storeItems = list.items.filter(
          (item: any) => item.store === store,
        );
        if (storeItems.length === 0) {
          respond(false, {
            ok: false,
            error: `No items assigned to ${store} in this grocery list`,
          });
          return;
        }

        const minimum = STORE_MINIMUMS[store];
        const warnings: string[] = [];
        if (minimum && storeItems.length < 4) {
          const storeName = store === "weee" ? "Weee!" : store;
          warnings.push(
            `${storeName} order has only ${storeItems.length} items — may be below the $${minimum} minimum`,
          );
        }

        // Create the order
        const order = await orderRepo.create({
          groceryListId,
          store,
          agentRunId: agentRunId ?? undefined,
        });

        // Set to agent_running
        await orderRepo.update(order.id, {
          status: "agent_running",
          startedAt: now(),
        });

        // Update grocery list status to "ordering"
        if (list.status === "finalized") {
          await groceryRepo.update(groceryListId, { status: "ordering" });
        }

        const updatedOrder = await orderRepo.getById(order.id);

        respond(true, {
          ok: true,
          order: updatedOrder,
          items: storeItems,
          warnings,
        });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
