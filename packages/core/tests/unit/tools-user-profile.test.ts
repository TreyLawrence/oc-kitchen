import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { UserProfileRepository } from "../../src/repositories/user-profile.repo.js";
import { createUpdateUserProfileTool } from "../../src/tools/user-profile-update.js";
import { createGetUserPreferencesTool } from "../../src/tools/user-profile-get.js";

// Spec: specs/shared/onboarding.md — Tool Contracts

describe("update_user_profile tool", () => {
  let repo: UserProfileRepository;
  let tool: ReturnType<typeof createUpdateUserProfileTool>;

  beforeEach(() => {
    const { db } = createTestDb();
    repo = new UserProfileRepository(db);
    tool = createUpdateUserProfileTool(repo);
  });

  it("has correct name and description", () => {
    expect(tool.name).toBe("update_user_profile");
    expect(tool.description).toBeTruthy();
  });

  it("adds equipment and sets preferences in one call", async () => {
    const respond = vi.fn();
    await tool.handler(
      {
        equipment: {
          add: [
            { name: "Big Green Egg", category: "grill" },
            { name: "Instant Pot", category: "appliance" },
          ],
        },
        preferences: {
          cuisine_affinities: ["korean", "mexican"],
          household_size: 2,
          favorite_sources: ["bonappetit.com", "thewoksoflife.com"],
        },
      },
      { respond }
    );

    expect(respond).toHaveBeenCalledWith(true, expect.objectContaining({ ok: true }));
    const result = respond.mock.calls[0][1];
    expect(result.equipment).toHaveLength(2);
    expect(result.preferences.cuisine_affinities).toEqual(["korean", "mexican"]);
    expect(result.preferences.household_size).toBe(2);
    expect(result.preferences.favorite_sources).toEqual(["bonappetit.com", "thewoksoflife.com"]);
  });

  it("removes equipment by id", async () => {
    const respond = vi.fn();

    // Add first
    await tool.handler(
      { equipment: { add: [{ name: "Old Grill", category: "grill" }] } },
      { respond }
    );
    const added = respond.mock.calls[0][1].equipment;

    // Remove
    await tool.handler(
      { equipment: { remove: [added[0].id] } },
      { respond }
    );
    const result = respond.mock.calls[1][1];
    expect(result.equipment).toHaveLength(0);
  });
});

describe("get_user_preferences tool", () => {
  let repo: UserProfileRepository;
  let updateTool: ReturnType<typeof createUpdateUserProfileTool>;
  let getTool: ReturnType<typeof createGetUserPreferencesTool>;

  beforeEach(() => {
    const { db } = createTestDb();
    repo = new UserProfileRepository(db);
    updateTool = createUpdateUserProfileTool(repo);
    getTool = createGetUserPreferencesTool(repo);
  });

  // Spec: "Onboarding triggers automatically when get_user_preferences returns empty"
  it("returns empty profile for new user", async () => {
    const respond = vi.fn();
    await getTool.handler({}, { respond });

    expect(respond).toHaveBeenCalledWith(true, {
      ok: true,
      equipment: [],
      preferences: {},
    });
  });

  it("returns full profile after onboarding", async () => {
    const respond = vi.fn();

    await updateTool.handler(
      {
        equipment: { add: [{ name: "Wok", category: "cookware" }] },
        preferences: {
          adventurousness: "adventurous",
          dislikes: ["cilantro"],
        },
      },
      { respond }
    );

    await getTool.handler({}, { respond });
    const result = respond.mock.calls[1][1];
    expect(result.ok).toBe(true);
    expect(result.equipment).toHaveLength(1);
    expect(result.equipment[0].name).toBe("Wok");
    expect(result.preferences.adventurousness).toBe("adventurous");
    expect(result.preferences.dislikes).toEqual(["cilantro"]);
  });
});
