import { ButcherBoxCutoffService } from "../services/butcherbox-cutoff.service.js";

export function createCheckButcherboxCutoffTool(service: ButcherBoxCutoffService) {
  return {
    name: "check_butcherbox_cutoff",
    description:
      "Check the ButcherBox subscription cutoff date and return a reminder status. Returns whether the cutoff is upcoming (within 3 days), past, or not yet close. When upcoming, also returns any ButcherBox-eligible proteins from active/draft meal plans so the agent can suggest customizing the box.",
    parameters: {
      type: "object",
      properties: {},
    },
    handler: async (_params: any, { respond }: any) => {
      try {
        const result = await service.checkCutoff();
        respond(true, { ok: true, ...result });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
