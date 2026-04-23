import { describe, it, expect, vi } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { UserProfileRepository } from "../../src/repositories/user-profile.repo.js";
import { createDiscoverRecipesTool } from "../../src/tools/recipe-discover.js";

describe("discover_recipes tool", () => {
  it("returns search queries scoped to user's favorite sources", async () => {
    const { db } = createTestDb();
    const profileRepo = new UserProfileRepository(db);
    await profileRepo.setPreference("favorite_sources", [
      "bonappetit.com",
      "cooking.nytimes.com",
      "thewoksoflife.com",
    ]);

    const tool = createDiscoverRecipesTool(profileRepo);
    const respond = vi.fn();

    await tool.handler({ query: "weeknight chicken", count: 3 }, { respond });

    expect(respond).toHaveBeenCalledWith(true, expect.objectContaining({ ok: true }));
    const result = respond.mock.calls[0][1];
    expect(result.searchQueries).toHaveLength(3);
    expect(result.searchQueries[0].query).toContain("site:bonappetit.com");
    expect(result.searchQueries[0].query).toContain("weeknight chicken");
    expect(result.searchQueries[1].query).toContain("site:cooking.nytimes.com");
    expect(result.searchQueries[2].query).toContain("site:thewoksoflife.com");
    expect(result.count).toBe(3);
  });

  it("filters by cuisine when specified", async () => {
    const { db } = createTestDb();
    const profileRepo = new UserProfileRepository(db);
    await profileRepo.setPreference("favorite_sources", ["bonappetit.com"]);

    const tool = createDiscoverRecipesTool(profileRepo);
    const respond = vi.fn();

    await tool.handler({ query: "noodles", cuisine: "korean" }, { respond });

    const result = respond.mock.calls[0][1];
    expect(result.searchQueries[0].query).toContain("korean");
  });

  it("uses override sources when provided", async () => {
    const { db } = createTestDb();
    const profileRepo = new UserProfileRepository(db);
    await profileRepo.setPreference("favorite_sources", ["bonappetit.com"]);

    const tool = createDiscoverRecipesTool(profileRepo);
    const respond = vi.fn();

    await tool.handler(
      { query: "tacos", sources: ["seriouseats.com"] },
      { respond }
    );

    const result = respond.mock.calls[0][1];
    expect(result.searchQueries).toHaveLength(1);
    expect(result.searchQueries[0].query).toContain("site:seriouseats.com");
  });

  it("errors when no sources configured", async () => {
    const { db } = createTestDb();
    const profileRepo = new UserProfileRepository(db);
    // No favorite_sources set

    const tool = createDiscoverRecipesTool(profileRepo);
    const respond = vi.fn();

    await tool.handler({ query: "anything" }, { respond });

    expect(respond).toHaveBeenCalledWith(false, expect.objectContaining({ ok: false }));
  });
});
