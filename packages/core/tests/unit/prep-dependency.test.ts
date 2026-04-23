import { describe, it, expect } from "vitest";
import { detectPrepDependencies } from "../../src/services/prep-dependency.service.js";

// Spec: specs/meal-planning/weekly-plan.md — Prep Dependency Detection

describe("detectPrepDependencies", () => {
  it("detects overnight marinade", () => {
    const hints = detectPrepDependencies(
      "Season the chicken and marinate overnight in the fridge."
    );
    expect(hints).toHaveLength(1);
    expect(hints[0].keyword).toBe("overnight");
    expect(hints[0].leadTimeHours).toBe(12);
    expect(hints[0].snippet).toContain("marinate overnight");
  });

  it("detects overnight brine", () => {
    const hints = detectPrepDependencies(
      "Dissolve salt in water. Submerge the turkey and brine overnight."
    );
    expect(hints).toHaveLength(1);
    expect(hints[0].keyword).toBe("overnight");
  });

  it("detects overnight rise for dough", () => {
    const hints = detectPrepDependencies(
      "Mix the dough and let it rise overnight in the refrigerator."
    );
    expect(hints).toHaveLength(1);
    expect(hints[0].keyword).toBe("overnight");
    expect(hints[0].leadTimeHours).toBe(12);
  });

  it("detects overnight as prefix (overnight marinade)", () => {
    const hints = detectPrepDependencies(
      "Prepare an overnight brine with salt, sugar, and aromatics."
    );
    expect(hints).toHaveLength(1);
    expect(hints[0].keyword).toBe("overnight");
  });

  it("detects 'the day before'", () => {
    const hints = detectPrepDependencies(
      "Make the stock the day before you plan to cook the soup."
    );
    expect(hints).toHaveLength(1);
    expect(hints[0].keyword).toBe("the day before");
    expect(hints[0].leadTimeHours).toBe(24);
  });

  it("detects 'a day in advance'", () => {
    const hints = detectPrepDependencies(
      "The dough should be prepared a day in advance for best results."
    );
    expect(hints).toHaveLength(1);
    expect(hints[0].keyword).toBe("the day before");
    expect(hints[0].leadTimeHours).toBe(24);
  });

  it("detects 'make ahead'", () => {
    const hints = detectPrepDependencies(
      "The sauce can be made ahead and stored in the fridge."
    );
    expect(hints).toHaveLength(1);
    expect(hints[0].keyword).toBe("make ahead");
    expect(hints[0].leadTimeHours).toBe(12);
  });

  it("detects 'prep ahead'", () => {
    const hints = detectPrepDependencies(
      "You can prep ahead by chopping all the vegetables."
    );
    expect(hints).toHaveLength(1);
    expect(hints[0].keyword).toBe("make ahead");
  });

  it("detects long rest times (>= 4 hours)", () => {
    const hints = detectPrepDependencies(
      "Let the dough rest for 8 hours in a cool place."
    );
    expect(hints).toHaveLength(1);
    expect(hints[0].keyword).toBe("8 hours");
    expect(hints[0].leadTimeHours).toBe(8);
  });

  it("detects 'marinate for X hours'", () => {
    const hints = detectPrepDependencies(
      "Marinate the pork for 6 hours or overnight."
    );
    // Should detect both the hours pattern and overnight
    const hoursHint = hints.find((h) => h.keyword === "6 hours");
    expect(hoursHint).toBeDefined();
    expect(hoursHint!.leadTimeHours).toBe(6);
  });

  it("detects 'X hours before'", () => {
    const hints = detectPrepDependencies(
      "Take the meat out of the fridge for 4 hours before cooking."
    );
    expect(hints).toHaveLength(1);
    expect(hints[0].keyword).toBe("4 hours");
    expect(hints[0].leadTimeHours).toBe(4);
  });

  it("ignores short rest times (< 4 hours)", () => {
    const hints = detectPrepDependencies(
      "Let the dough rest for 30 minutes before rolling."
    );
    expect(hints).toHaveLength(0);
  });

  it("ignores 2-hour rest", () => {
    const hints = detectPrepDependencies(
      "Chill for 2 hours before serving."
    );
    expect(hints).toHaveLength(0);
  });

  it("returns empty array for recipes with no prep needs", () => {
    const hints = detectPrepDependencies(
      "Heat oil in a pan. Add garlic, cook 1 minute. Add chicken, cook 5 minutes per side. Serve with rice."
    );
    expect(hints).toEqual([]);
  });

  it("detects multiple prep needs in one recipe", () => {
    const hints = detectPrepDependencies(
      "Make the stock the day before. Marinate the chicken overnight in the spice mixture. Let the dough rise for 8 hours."
    );
    expect(hints.length).toBeGreaterThanOrEqual(3);
    const keywords = hints.map((h) => h.keyword);
    expect(keywords).toContain("the day before");
    expect(keywords).toContain("overnight");
    expect(keywords).toContain("8 hours");
  });

  it("includes a readable snippet around the match", () => {
    const instructions =
      "Step 1: Mix the flour and water. Step 2: Cover and let the dough rise overnight in the fridge. Step 3: Shape and bake.";
    const hints = detectPrepDependencies(instructions);
    expect(hints).toHaveLength(1);
    expect(hints[0].snippet).toContain("rise overnight");
    // Should have ellipsis for truncation
    expect(hints[0].snippet).toMatch(/\.\.\./);
  });
});
