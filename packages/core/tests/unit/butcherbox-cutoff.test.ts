import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { UserProfileRepository } from "../../src/repositories/user-profile.repo.js";
import { MealPlanRepository } from "../../src/repositories/meal-plan.repo.js";
import { RecipeRepository } from "../../src/repositories/recipe.repo.js";
import { ButcherBoxCutoffService } from "../../src/services/butcherbox-cutoff.service.js";
import { createCheckButcherboxCutoffTool } from "../../src/tools/butcherbox-cutoff.js";

// Spec: specs/grocery/ordering.md rule 10

describe("ButcherBoxCutoffService", () => {
  let profileRepo: UserProfileRepository;
  let mealPlanRepo: MealPlanRepository;
  let recipeRepo: RecipeRepository;
  let service: ButcherBoxCutoffService;

  beforeEach(() => {
    const { db } = createTestDb();
    profileRepo = new UserProfileRepository(db);
    mealPlanRepo = new MealPlanRepository(db);
    recipeRepo = new RecipeRepository(db);
    service = new ButcherBoxCutoffService(profileRepo, mealPlanRepo, recipeRepo);
  });

  it("returns not_subscribed when no butcherbox subscription", async () => {
    const result = await service.checkCutoff("2026-04-23");
    expect(result.status).toBe("not_subscribed");
  });

  it("returns no_cutoff_set when subscribed but no cutoff date", async () => {
    await profileRepo.setPreference("butcherbox_subscription", true);
    const result = await service.checkCutoff("2026-04-23");
    expect(result.status).toBe("no_cutoff_set");
  });

  it("returns ok when cutoff is more than 3 days away", async () => {
    await profileRepo.setPreference("butcherbox_subscription", true);
    await profileRepo.setPreference("butcherbox_cutoff_date", "2026-05-01");

    const result = await service.checkCutoff("2026-04-23");
    expect(result.status).toBe("ok");
    expect(result.cutoffDate).toBe("2026-05-01");
    expect(result.daysUntilCutoff).toBe(8);
  });

  it("returns upcoming when cutoff is within 3 days", async () => {
    await profileRepo.setPreference("butcherbox_subscription", true);
    await profileRepo.setPreference("butcherbox_cutoff_date", "2026-04-25");
    await profileRepo.setPreference("butcherbox_delivery_date", "2026-05-02");

    const result = await service.checkCutoff("2026-04-23");
    expect(result.status).toBe("upcoming");
    expect(result.cutoffDate).toBe("2026-04-25");
    expect(result.deliveryDate).toBe("2026-05-02");
    expect(result.daysUntilCutoff).toBe(2);
  });

  it("returns upcoming on the cutoff day itself", async () => {
    await profileRepo.setPreference("butcherbox_subscription", true);
    await profileRepo.setPreference("butcherbox_cutoff_date", "2026-04-23");

    const result = await service.checkCutoff("2026-04-23");
    expect(result.status).toBe("upcoming");
    expect(result.daysUntilCutoff).toBe(0);
  });

  it("returns past when cutoff has passed", async () => {
    await profileRepo.setPreference("butcherbox_subscription", true);
    await profileRepo.setPreference("butcherbox_cutoff_date", "2026-04-20");

    const result = await service.checkCutoff("2026-04-23");
    expect(result.status).toBe("past");
    expect(result.daysUntilCutoff).toBe(-3);
  });

  it("includes meal plan proteins when cutoff is upcoming", async () => {
    await profileRepo.setPreference("butcherbox_subscription", true);
    await profileRepo.setPreference("butcherbox_cutoff_date", "2026-04-25");

    const recipe = await recipeRepo.create({
      title: "Grilled Ribeye",
      source: "manual",
      instructions: "Grill it",
      ingredients: [
        { name: "ribeye steak", quantity: 2, unit: "lbs", category: "protein" },
        { name: "garlic", quantity: 4, unit: "cloves", category: "produce" },
      ],
    });

    await mealPlanRepo.create({
      name: "This Week",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [{ dayOfWeek: 2, mealType: "dinner", recipeId: recipe.id, category: "exploit" }],
    });

    const result = await service.checkCutoff("2026-04-23");
    expect(result.status).toBe("upcoming");
    expect(result.mealPlanProteins).toHaveLength(1);
    expect(result.mealPlanProteins![0].mealPlanName).toBe("This Week");
    expect(result.mealPlanProteins![0].proteins).toHaveLength(1);
    expect(result.mealPlanProteins![0].proteins[0].name).toBe("ribeye steak");
    expect(result.mealPlanProteins![0].proteins[0].recipeTitle).toBe("Grilled Ribeye");
  });

  it("excludes non-protein ingredients from meal plan proteins", async () => {
    await profileRepo.setPreference("butcherbox_subscription", true);
    await profileRepo.setPreference("butcherbox_cutoff_date", "2026-04-25");

    const recipe = await recipeRepo.create({
      title: "Chicken Stir Fry",
      source: "manual",
      instructions: "Stir fry",
      ingredients: [
        { name: "chicken breast", quantity: 2, unit: "lbs", category: "protein" },
        { name: "broccoli", quantity: 1, unit: "head", category: "produce" },
        { name: "soy sauce", quantity: 2, unit: "tbsp", category: "pantry" },
      ],
    });

    await mealPlanRepo.create({
      name: "Test Plan",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [{ dayOfWeek: 0, mealType: "dinner", recipeId: recipe.id, category: "exploit" }],
    });

    const result = await service.checkCutoff("2026-04-23");
    expect(result.mealPlanProteins![0].proteins).toHaveLength(1);
    expect(result.mealPlanProteins![0].proteins[0].name).toBe("chicken breast");
  });

  it("excludes completed meal plans from protein search", async () => {
    await profileRepo.setPreference("butcherbox_subscription", true);
    await profileRepo.setPreference("butcherbox_cutoff_date", "2026-04-25");

    const recipe = await recipeRepo.create({
      title: "Salmon Dinner",
      source: "manual",
      instructions: "Cook",
      ingredients: [
        { name: "salmon", quantity: 1, unit: "lb", category: "protein" },
      ],
    });

    const plan = await mealPlanRepo.create({
      name: "Last Week",
      weekStart: "2026-04-20",
      weekEnd: "2026-04-26",
      entries: [{ dayOfWeek: 0, mealType: "dinner", recipeId: recipe.id, category: "exploit" }],
    });

    await mealPlanRepo.update(plan!.id, { status: "completed" });

    const result = await service.checkCutoff("2026-04-23");
    expect(result.mealPlanProteins).toHaveLength(0);
  });

  it("skips proteins not in the ButcherBox list", async () => {
    await profileRepo.setPreference("butcherbox_subscription", true);
    await profileRepo.setPreference("butcherbox_cutoff_date", "2026-04-25");

    const recipe = await recipeRepo.create({
      title: "Shrimp Scampi",
      source: "manual",
      instructions: "Cook",
      ingredients: [
        { name: "shrimp", quantity: 1, unit: "lb", category: "protein" },
      ],
    });

    await mealPlanRepo.create({
      name: "Test",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [{ dayOfWeek: 0, mealType: "dinner", recipeId: recipe.id, category: "exploit" }],
    });

    const result = await service.checkCutoff("2026-04-23");
    expect(result.mealPlanProteins).toHaveLength(0);
  });

  it("does not include proteins when cutoff is not upcoming", async () => {
    await profileRepo.setPreference("butcherbox_subscription", true);
    await profileRepo.setPreference("butcherbox_cutoff_date", "2026-05-01");

    const recipe = await recipeRepo.create({
      title: "Steak",
      source: "manual",
      instructions: "Cook",
      ingredients: [
        { name: "steak", quantity: 1, unit: "lb", category: "protein" },
      ],
    });

    await mealPlanRepo.create({
      name: "Test",
      weekStart: "2026-04-27",
      weekEnd: "2026-05-03",
      entries: [{ dayOfWeek: 0, mealType: "dinner", recipeId: recipe.id, category: "exploit" }],
    });

    const result = await service.checkCutoff("2026-04-23");
    expect(result.status).toBe("ok");
    expect(result.mealPlanProteins).toBeUndefined();
  });
});

describe("check_butcherbox_cutoff tool", () => {
  let profileRepo: UserProfileRepository;
  let mealPlanRepo: MealPlanRepository;
  let recipeRepo: RecipeRepository;
  let service: ButcherBoxCutoffService;

  beforeEach(() => {
    const { db } = createTestDb();
    profileRepo = new UserProfileRepository(db);
    mealPlanRepo = new MealPlanRepository(db);
    recipeRepo = new RecipeRepository(db);
    service = new ButcherBoxCutoffService(profileRepo, mealPlanRepo, recipeRepo);
  });

  it("has the correct name and description", () => {
    const tool = createCheckButcherboxCutoffTool(service);
    expect(tool.name).toBe("check_butcherbox_cutoff");
    expect(tool.description).toContain("cutoff");
  });

  it("calls respond with ok: true on success", async () => {
    const tool = createCheckButcherboxCutoffTool(service);
    let response: any;
    const respond = (success: boolean, data: any) => { response = { success, data }; };

    await tool.handler({}, { respond });
    expect(response.success).toBe(true);
    expect(response.data.ok).toBe(true);
    expect(response.data.status).toBe("not_subscribed");
  });
});
