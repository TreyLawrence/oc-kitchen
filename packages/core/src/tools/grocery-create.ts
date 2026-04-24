import { GroceryRepository } from "../repositories/grocery.repo.js";

export function createCreateGroceryListTool(groceryRepo: GroceryRepository) {
  return {
    name: "create_grocery_list",
    description:
      "Create an ad-hoc grocery list without a meal plan. Use this for plain shopping lists — the user tells you what they need, you build the list.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name for the list (e.g. 'Party supplies', 'Weeknight basics')" },
        items: {
          type: "array",
          description: "Items to add to the list",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Item name" },
              quantity: { type: "number", description: "Amount needed" },
              unit: { type: "string", description: "Unit (lbs, count, oz, etc.)" },
              category: { type: "string", description: "Category: protein, produce, dairy, pantry, spice, other" },
              store: { type: "string", description: "Store: wegmans, weee, butcherbox, or omit for unassigned" },
            },
            required: ["name"],
          },
        },
      },
      required: ["name", "items"],
    },
    handler: async (params: any, { respond }: any) => {
      try {
        const list = await groceryRepo.create({
          name: params.name,
          items: params.items,
        });

        const fullList = await groceryRepo.getById(list.id);

        respond(true, { ok: true, list: fullList });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
