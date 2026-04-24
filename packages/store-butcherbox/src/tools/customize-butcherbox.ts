import {
  runButcherBoxAutomation,
  type ButcherBoxItem,
} from "../automation.js";

export function createCustomizeButcherBoxTool() {
  return {
    name: "customize_butcherbox",
    description:
      "Launch computer-use agent to customize the upcoming ButcherBox shipment. Swaps and adds items based on the meal plan before the monthly cutoff date.",
    parameters: {
      type: "object",
      properties: {
        groceryListId: {
          type: "string",
          description: "The grocery list this customization is for",
        },
        items: {
          type: "array",
          description:
            "Meat items from the grocery list assigned to ButcherBox",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Item name" },
              quantity: { type: "number", description: "Amount needed" },
              unit: {
                type: "string",
                description: 'Unit of measure (e.g., "lbs", "count")',
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
        const { groceryListId, items } = params;

        if (!items || items.length === 0) {
          respond(false, { ok: false, error: "No items provided" });
          return;
        }

        const typedItems: ButcherBoxItem[] = items.map((item: any) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
        }));

        const result = await runButcherBoxAutomation(
          typedItems,
          (update) => {
            respond(true, { ...update, groceryListId });
          },
        );

        respond(true, {
          ok: true,
          groceryListId,
          cutoffDate: result.cutoffDate,
          nextDelivery: result.nextDelivery,
          contents: result.contents,
          couldNotFit: result.couldNotFit,
        });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
