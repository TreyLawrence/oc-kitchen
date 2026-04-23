import { UserProfileRepository } from "../repositories/user-profile.repo.js";

export function createUpdateUserProfileTool(repo: UserProfileRepository) {
  return {
    name: "update_user_profile",
    description:
      "Add or update kitchen equipment and user preferences (cuisine affinities, dietary constraints, favorite recipe sources, household size, etc.)",
    parameters: {
      type: "object",
      properties: {
        equipment: {
          type: "object",
          description: "Equipment changes",
          properties: {
            add: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: 'Equipment name (e.g., "Big Green Egg")' },
                  category: {
                    type: "string",
                    enum: ["grill", "appliance", "cookware", "bakeware", "outdoor", "tool"],
                    description: "Equipment category",
                  },
                },
                required: ["name"],
              },
              description: "Equipment to add",
            },
            remove: {
              type: "array",
              items: { type: "string" },
              description: "Equipment IDs to remove",
            },
          },
        },
        preferences: {
          type: "object",
          description:
            "Preference key-value pairs to set. Keys: cuisine_affinities, adventurousness, dietary_constraints, dislikes, household_size, default_servings, favorite_sources",
          additionalProperties: true,
        },
      },
    },
    handler: async (params: any, { respond }: any) => {
      try {
        if (params.equipment?.add) {
          await repo.addEquipment(params.equipment.add);
        }
        if (params.equipment?.remove) {
          await repo.removeEquipment(params.equipment.remove);
        }
        if (params.preferences) {
          for (const [key, value] of Object.entries(params.preferences)) {
            await repo.setPreference(key, value);
          }
        }

        const profile = await repo.getFullProfile();
        respond(true, { ok: true, ...profile });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}
