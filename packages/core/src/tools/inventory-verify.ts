import { InventoryRepository } from "../repositories/inventory.repo.js";

export function createVerifyInventoryTool(repo: InventoryRepository) {
  return {
    name: "verify_inventory",
    description:
      "Pre-order inventory freshness check. Flags items that haven't been updated recently (perishables: 5+ days, pantry: 30+ days) so the agent can confirm with the user before generating a grocery list.",
    parameters: {
      type: "object",
      properties: {
        mealPlanId: { type: "string", description: "Optional — check items relevant to this meal plan" },
      },
    },
    handler: async (params: any, { respond }: any) => {
      try {
        const { confident, needsCheck } = await repo.getStaleItems();

        let question = "";
        if (needsCheck.length > 0) {
          const itemNames = needsCheck.map((i: any) => {
            const loc = i.location ? ` in the ${i.location}` : "";
            return `${i.name}${loc}`;
          });
          question = `Before I generate your grocery list, can you confirm: do you still have ${itemNames.join(", ")}?`;
        }

        respond(true, {
          ok: true,
          confident,
          needsCheck,
          question,
          allFresh: needsCheck.length === 0,
        });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
