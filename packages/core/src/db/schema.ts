import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ─── Recipes ───────────────────────────────────────────────

export const recipes = sqliteTable("recipes", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  source: text("source").notNull(), // "ai_generated" | "imported" | "manual"
  sourceUrl: text("source_url"),
  servings: integer("servings"),
  prepMinutes: integer("prep_minutes"),
  cookMinutes: integer("cook_minutes"),
  passiveMinutes: integer("passive_minutes"), // Hands-off time within cook (braising, smoking, rising)
  instructions: text("instructions").notNull(), // Markdown
  verdict: text("verdict"), // Derived from most recent cook log: "banger" | "make_again" | "try_again_with_tweaks" | "dont_make_again"
  isFavorite: integer("is_favorite", { mode: "boolean" }).default(false),
  tags: text("tags"), // JSON array of strings
  notes: text("notes"),
  imageUrl: text("image_url"),
  createdAt: text("created_at").notNull(), // ISO 8601
  updatedAt: text("updated_at").notNull(),
});

export const recipeIngredients = sqliteTable("recipe_ingredients", {
  id: text("id").primaryKey(),
  recipeId: text("recipe_id")
    .notNull()
    .references(() => recipes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  quantity: real("quantity"),
  unit: text("unit"),
  category: text("category"), // "protein", "produce", "dairy", "pantry", "spice", "other"
  sortOrder: integer("sort_order").notNull().default(0),
});

// ─── Cook Log ──────────────────────────────────────────────

export const cookLog = sqliteTable("cook_log", {
  id: text("id").primaryKey(),
  recipeId: text("recipe_id")
    .notNull()
    .references(() => recipes.id, { onDelete: "cascade" }),
  verdict: text("verdict").notNull(), // "banger" | "make_again" | "try_again_with_tweaks" | "dont_make_again"
  notes: text("notes"),
  modifications: text("modifications"), // JSON array of { original, modification }
  photos: text("photos"), // JSON array of file paths/URLs
  cookedAt: text("cooked_at").notNull(), // ISO 8601
});

// ─── Meal Plans ────────────────────────────────────────────

export const mealPlans = sqliteTable("meal_plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  weekStart: text("week_start").notNull(), // ISO date (Monday)
  weekEnd: text("week_end").notNull(), // ISO date (Sunday)
  status: text("status").notNull().default("draft"), // "draft" | "active" | "completed"
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const mealPlanEntries = sqliteTable("meal_plan_entries", {
  id: text("id").primaryKey(),
  mealPlanId: text("meal_plan_id")
    .notNull()
    .references(() => mealPlans.id, { onDelete: "cascade" }),
  recipeId: text("recipe_id").references(() => recipes.id, {
    onDelete: "set null",
  }),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Monday ... 6=Sunday
  mealType: text("meal_type").notNull(), // "breakfast" | "lunch" | "dinner" | "snack"
  customTitle: text("custom_title"),
  category: text("category"), // "exploit" | "explore" | "leftover" | "prep" | "skip"
  dependsOn: text("depends_on"), // recipe ID this entry depends on (e.g., stock → soup)
  sortOrder: integer("sort_order").notNull().default(0),
});

// ─── Inventory ─────────────────────────────────────────────

export const inventoryItems = sqliteTable("inventory_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category"),
  quantity: real("quantity"),
  unit: text("unit"),
  isLeftover: integer("is_leftover", { mode: "boolean" }).default(false),
  sourceRecipeId: text("source_recipe_id").references(() => recipes.id),
  location: text("location"), // "fridge", "freezer", "pantry"
  expiresAt: text("expires_at"),
  purchasedAt: text("purchased_at"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── Grocery ───────────────────────────────────────────────

export const groceryLists = sqliteTable("grocery_lists", {
  id: text("id").primaryKey(),
  mealPlanId: text("meal_plan_id").references(() => mealPlans.id),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"), // "draft" | "finalized" | "ordering" | "ordered"
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const groceryItems = sqliteTable("grocery_items", {
  id: text("id").primaryKey(),
  groceryListId: text("grocery_list_id")
    .notNull()
    .references(() => groceryLists.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  quantity: real("quantity"),
  unit: text("unit"),
  category: text("category"),
  store: text("store"), // "wegmans" | "weee" | null
  isChecked: integer("is_checked", { mode: "boolean" }).default(false),
  recipeId: text("recipe_id").references(() => recipes.id),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const groceryOrders = sqliteTable("grocery_orders", {
  id: text("id").primaryKey(),
  groceryListId: text("grocery_list_id")
    .notNull()
    .references(() => groceryLists.id),
  store: text("store").notNull(),
  status: text("status").notNull().default("pending"),
  agentRunId: text("agent_run_id"),
  orderTotal: real("order_total"),
  errorMessage: text("error_message"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── User Profile ──────────────────────────────────────────

export const userEquipment = sqliteTable("user_equipment", {
  id: text("id").primaryKey(),
  name: text("name").notNull(), // "Big Green Egg", "Instant Pot", etc.
  category: text("category"), // "grill", "appliance", "cookware", "bakeware", "tool"
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const userPreferences = sqliteTable("user_preferences", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(), // "cuisine_affinities", "spice_tolerance", "dietary_constraints", etc.
  value: text("value").notNull(), // JSON value
  updatedAt: text("updated_at").notNull(),
});
