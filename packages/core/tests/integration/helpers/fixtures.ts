import type { IntegrationHarness } from "./harness.js";

/** Seed equipment matching Trey's real kitchen profile */
export const EQUIPMENT = [
  { name: "Big Green Egg", category: "grill" },
  { name: "Instant Pot", category: "appliance" },
  { name: "King Kooker", category: "fryer" },
  { name: "Zojirushi Rice Cooker", category: "appliance" },
  { name: "Cast Iron Skillet", category: "cookware" },
  { name: "Dutch Oven", category: "cookware" },
  { name: "Sheet Pan", category: "cookware" },
];

/** Realistic recipes spanning categories and complexity */
export const RECIPES = {
  smokedPorkShoulder: {
    title: "Smoked Pork Shoulder",
    source: "manual" as const,
    instructions:
      "Set BGE to 225°F with cherry wood chunks. Rub shoulder with salt, pepper, paprika, garlic powder. Smoke 1.5 hrs/lb until internal temp hits 195°F. Rest 30 min before pulling.",
    description: "Low and slow pulled pork on the Big Green Egg",
    servings: 8,
    prepMinutes: 20,
    cookMinutes: 720,
    ingredients: [
      { name: "pork shoulder", quantity: 8, unit: "lbs", category: "protein" },
      { name: "kosher salt", quantity: 2, unit: "tbsp", category: "spice" },
      { name: "black pepper", quantity: 1, unit: "tbsp", category: "spice" },
      { name: "smoked paprika", quantity: 1, unit: "tbsp", category: "spice" },
      { name: "garlic powder", quantity: 1, unit: "tbsp", category: "spice" },
    ],
    tags: ["bbq", "project"],
  },
  mapoTofu: {
    title: "Mapo Tofu",
    source: "imported" as const,
    sourceUrl: "https://thewoksoflife.com/mapo-tofu-recipe/",
    instructions:
      "Press tofu and cube. Brown pork in wok. Add doubanjiang, fermented black beans, chili oil. Add stock, tofu, simmer 5 min. Finish with Sichuan peppercorn, scallions.",
    description: "Classic Sichuan mapo tofu from Woks of Life",
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 20,
    ingredients: [
      { name: "firm tofu", quantity: 14, unit: "oz", category: "protein" },
      { name: "ground pork", quantity: 4, unit: "oz", category: "protein" },
      { name: "doubanjiang", quantity: 2, unit: "tbsp", category: "pantry" },
      { name: "fermented black beans", quantity: 1, unit: "tbsp", category: "pantry" },
      { name: "chili oil", quantity: 1, unit: "tbsp", category: "pantry" },
      { name: "chicken stock", quantity: 1, unit: "cup", category: "pantry" },
      { name: "Sichuan peppercorn", quantity: 1, unit: "tsp", category: "spice" },
      { name: "scallions", quantity: 3, unit: "stalks", category: "produce" },
    ],
    tags: ["weeknight", "wok"],
  },
  sheetPanChicken: {
    title: "Sheet Pan Chicken Thighs with Vegetables",
    source: "manual" as const,
    instructions:
      "Preheat oven to 425°F. Toss broccoli, sweet potato, and red onion with olive oil, salt, pepper. Arrange chicken thighs on top. Roast 35-40 min.",
    description: "Easy weeknight one-pan dinner",
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 40,
    ingredients: [
      { name: "chicken thighs", quantity: 2, unit: "lbs", category: "protein" },
      { name: "broccoli", quantity: 1, unit: "head", category: "produce" },
      { name: "sweet potato", quantity: 2, unit: "medium", category: "produce" },
      { name: "red onion", quantity: 1, unit: "medium", category: "produce" },
      { name: "olive oil", quantity: 3, unit: "tbsp", category: "pantry" },
    ],
    tags: ["weeknight", "quick"],
  },
  risotto: {
    title: "Mushroom Risotto",
    source: "manual" as const,
    instructions:
      "Sauté mushrooms in butter, set aside. Toast arborio rice in olive oil. Add white wine, stir until absorbed. Ladle in warm stock 1 cup at a time, stirring. Fold in mushrooms, parmesan, butter at end.",
    description: "Creamy risotto with mixed mushrooms",
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 35,
    ingredients: [
      { name: "arborio rice", quantity: 1.5, unit: "cups", category: "pantry" },
      { name: "mixed mushrooms", quantity: 12, unit: "oz", category: "produce" },
      { name: "chicken stock", quantity: 6, unit: "cups", category: "pantry" },
      { name: "white wine", quantity: 0.5, unit: "cup", category: "pantry" },
      { name: "parmesan", quantity: 1, unit: "cup", category: "dairy" },
      { name: "butter", quantity: 3, unit: "tbsp", category: "dairy" },
      { name: "yellow onion", quantity: 1, unit: "medium", category: "produce" },
    ],
    tags: ["weeknight"],
  },
  instantPotChili: {
    title: "Instant Pot Beef Chili",
    source: "manual" as const,
    instructions:
      "Sauté onion and garlic on Sauté mode. Brown beef. Add tomatoes, beans, chili powder, cumin. Pressure cook 25 min. Natural release 10 min.",
    description: "Hearty beef chili in the Instant Pot",
    servings: 6,
    prepMinutes: 10,
    cookMinutes: 35,
    ingredients: [
      { name: "ground beef", quantity: 2, unit: "lbs", category: "protein" },
      { name: "kidney beans", quantity: 2, unit: "cans", category: "pantry" },
      { name: "crushed tomatoes", quantity: 28, unit: "oz", category: "pantry" },
      { name: "yellow onion", quantity: 1, unit: "large", category: "produce" },
      { name: "garlic", quantity: 4, unit: "cloves", category: "produce" },
      { name: "chili powder", quantity: 3, unit: "tbsp", category: "spice" },
      { name: "cumin", quantity: 1, unit: "tbsp", category: "spice" },
    ],
    tags: ["instant-pot"],
  },
};

/** Seed preferences for a realistic user profile */
export const PREFERENCES = {
  defaultStore: "wegmans",
  householdSize: "3",
  dietaryRestrictions: JSON.stringify([]),
  favoriteCuisines: JSON.stringify(["chinese", "italian", "bbq", "mexican"]),
  cookingSkillLevel: "advanced",
};

/**
 * Seed a harness with fixtures via tool calls. Returns IDs of created entities
 * so tests can reference them.
 */
export async function seedFixtures(h: IntegrationHarness) {
  // Seed equipment
  await h.repos.userProfile.addEquipment(EQUIPMENT);

  // Seed preferences
  for (const [key, value] of Object.entries(PREFERENCES)) {
    await h.repos.userProfile.setPreference(key, value);
  }

  // Create recipes via the tool (exercises auto-tagger)
  const recipeIds: Record<string, string> = {};
  for (const [key, recipe] of Object.entries(RECIPES)) {
    const result = await h.call("create_recipe", recipe);
    if (!result.success) {
      throw new Error(`Failed to seed recipe "${recipe.title}": ${JSON.stringify(result.data)}`);
    }
    recipeIds[key] = result.data.recipe.id;
  }

  return { recipeIds };
}
