import { UserProfileRepository } from "../repositories/user-profile.repo.js";

/**
 * Calendar check stub. Returns the tool structure and instructions
 * for the agent to check Google Calendar availability.
 *
 * Full Google Calendar OAuth integration is a follow-up.
 * For now, this tool returns the user's cooking window preferences
 * and instructs the agent to ask the user directly about their schedule.
 */
export function createCheckCalendarTool(profileRepo: UserProfileRepository) {
  return {
    name: "check_calendar",
    description:
      "Check available cooking time per evening for the week. Uses Google Calendar if connected, otherwise asks the user directly.",
    parameters: {
      type: "object",
      properties: {
        weekStart: { type: "string", description: "Monday date (YYYY-MM-DD)" },
        weekEnd: { type: "string", description: "Sunday date (YYYY-MM-DD)" },
      },
      required: ["weekStart"],
    },
    handler: async (params: any, { respond }: any) => {
      try {
        // Get user's cooking window preferences
        const cookingWindowStart = await profileRepo.getPreference("cooking_window_start") as string || "17:00";
        const dinnerTargetTime = await profileRepo.getPreference("dinner_target_time") as string || "19:30";

        // TODO: Google Calendar OAuth integration
        // For now, return preferences and instruct agent to ask the user
        respond(true, {
          ok: true,
          calendarConnected: false,
          cookingWindowStart,
          dinnerTargetTime,
          action: "ask_user",
          instructions:
            `Google Calendar is not connected yet. Ask the user which nights they're free to cook this week (${params.weekStart} to ${params.weekEnd || "Sunday"}). For each night, ask if they have any evening commitments that would limit cooking time. Use their default cooking window: start at ${cookingWindowStart}, dinner ready by ${dinnerTargetTime} (${calculateMinutes(cookingWindowStart, dinnerTargetTime)} minutes available on a free night).`,
          defaultAvailableMinutes: calculateMinutes(cookingWindowStart, dinnerTargetTime),
        });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}

function calculateMinutes(start: string, end: string): number {
  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);
  return (endH * 60 + endM) - (startH * 60 + startM);
}
