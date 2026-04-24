import { runWeeeAutomation, type WeeeItem } from "../automation.js";

export function createOrderWeeeTool() {
  return {
    name: "order_weee",
    description:
      "Launch computer-use agent to order groceries from Weee!. Fills the cart (and optionally checks out). Reports progress as items are added.",
    parameters: {
      type: "object",
      properties: {
        groceryListId: {
          type: "string",
          description: "The grocery list this order is for",
        },
        checkout: {
          type: "boolean",
          description:
            "If true, complete checkout. If false (default), fill cart only.",
          default: false,
        },
        items: {
          type: "array",
          description: "Items to order from Weee!",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Item name" },
              quantity: { type: "number", description: "Amount to order" },
              unit: {
                type: "string",
                description: 'Unit of measure (e.g., "lbs", "count", "oz")',
              },
            },
            required: ["name", "quantity", "unit"],
          },
          minItems: 1,
        },
      },
      required: ["groceryListId", "items"],
    },
    handler: async (params: any, { respond }: any) => {
      try {
        const { groceryListId, checkout = false, items } = params;

        if (!items || items.length === 0) {
          respond(false, { ok: false, error: "No items provided" });
          return;
        }

        const typedItems: WeeeItem[] = items.map((item: any) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
        }));

        const result = await runWeeeAutomation(
          typedItems,
          { checkout },
          (update) => {
            respond(true, { ...update, groceryListId });
          },
        );

        respond(true, {
          ok: true,
          groceryListId,
          total: result.total,
          itemsAdded: result.itemsAdded.length,
          itemsMissing: result.itemsMissing,
        });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
