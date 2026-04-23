import { InventorySyncService } from "../services/inventory-sync.service.js";

export function createSyncDeliveryToInventoryTool(syncService: InventorySyncService) {
  return {
    name: "sync_delivery_to_inventory",
    description:
      "After a grocery order is delivered, sync the ordered items into kitchen inventory. " +
      "Maps items to the right location (fridge/pantry) and estimates expiration dates for perishables.",
    parameters: {
      type: "object",
      properties: {
        groceryListId: {
          type: "string",
          description: "The ID of the grocery list whose items were delivered",
        },
        deliveryDate: {
          type: "string",
          description: "Delivery date (YYYY-MM-DD). Defaults to today.",
        },
      },
      required: ["groceryListId"],
    },
    handler: async (params: any, { respond }: any) => {
      try {
        const result = await syncService.syncDelivery(params.groceryListId, {
          deliveryDate: params.deliveryDate,
        });

        if (!result.ok) {
          respond(false, result);
          return;
        }

        respond(true, result);
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
