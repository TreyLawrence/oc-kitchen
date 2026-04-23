import { UserProfileRepository } from "../repositories/user-profile.repo.js";

export function createGetUserPreferencesTool(repo: UserProfileRepository) {
  return {
    name: "get_user_preferences",
    description:
      "Retrieve the user's full kitchen profile — equipment, cuisine preferences, dietary constraints, favorite recipe sources, and learned preference summary",
    parameters: {
      type: "object",
      properties: {},
    },
    handler: async (_params: any, { respond }: any) => {
      try {
        const profile = await repo.getFullProfile();
        respond(true, { ok: true, ...profile });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
