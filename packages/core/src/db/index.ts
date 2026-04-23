import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema.js";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const DEFAULT_DB_DIR = path.join(os.homedir(), ".openclaw", "oc-kitchen");
const DEFAULT_DB_PATH = path.join(DEFAULT_DB_DIR, "kitchen.db");

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb(dbPath?: string) {
  if (_db) return _db;

  const resolvedPath = dbPath || process.env.OC_KITCHEN_DB_PATH || DEFAULT_DB_PATH;

  // Ensure directory exists
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(resolvedPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  _db = drizzle(sqlite, { schema });
  return _db;
}

/** For testing — create an in-memory database with all tables */
export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");

  // Create all tables directly from SQL (avoids needing migration files at test time)
  sqlite.exec(`
    CREATE TABLE recipes (
      id text PRIMARY KEY NOT NULL,
      title text NOT NULL,
      description text,
      source text NOT NULL,
      source_url text,
      servings integer,
      prep_minutes integer,
      cook_minutes integer,
      instructions text NOT NULL,
      verdict text,
      is_favorite integer DEFAULT false,
      tags text,
      notes text,
      image_url text,
      created_at text NOT NULL,
      updated_at text NOT NULL
    );
    CREATE TABLE recipe_ingredients (
      id text PRIMARY KEY NOT NULL,
      recipe_id text NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      name text NOT NULL,
      quantity real,
      unit text,
      category text,
      sort_order integer DEFAULT 0 NOT NULL
    );
    CREATE TABLE cook_log (
      id text PRIMARY KEY NOT NULL,
      recipe_id text NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      verdict text NOT NULL,
      notes text,
      modifications text,
      photos text,
      cooked_at text NOT NULL
    );
    CREATE TABLE meal_plans (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      week_start text NOT NULL,
      week_end text NOT NULL,
      status text DEFAULT 'draft' NOT NULL,
      notes text,
      created_at text NOT NULL,
      updated_at text NOT NULL
    );
    CREATE TABLE meal_plan_entries (
      id text PRIMARY KEY NOT NULL,
      meal_plan_id text NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
      recipe_id text REFERENCES recipes(id) ON DELETE SET NULL,
      day_of_week integer NOT NULL,
      meal_type text NOT NULL,
      custom_title text,
      sort_order integer DEFAULT 0 NOT NULL
    );
    CREATE TABLE inventory_items (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      category text,
      quantity real,
      unit text,
      location text,
      expires_at text,
      purchased_at text,
      notes text,
      created_at text NOT NULL,
      updated_at text NOT NULL
    );
    CREATE TABLE grocery_lists (
      id text PRIMARY KEY NOT NULL,
      meal_plan_id text REFERENCES meal_plans(id),
      name text NOT NULL,
      status text DEFAULT 'draft' NOT NULL,
      created_at text NOT NULL,
      updated_at text NOT NULL
    );
    CREATE TABLE grocery_items (
      id text PRIMARY KEY NOT NULL,
      grocery_list_id text NOT NULL REFERENCES grocery_lists(id) ON DELETE CASCADE,
      name text NOT NULL,
      quantity real,
      unit text,
      category text,
      store text,
      is_checked integer DEFAULT false,
      recipe_id text REFERENCES recipes(id),
      sort_order integer DEFAULT 0 NOT NULL
    );
    CREATE TABLE grocery_orders (
      id text PRIMARY KEY NOT NULL,
      grocery_list_id text NOT NULL REFERENCES grocery_lists(id),
      store text NOT NULL,
      status text DEFAULT 'pending' NOT NULL,
      agent_run_id text,
      order_total real,
      error_message text,
      started_at text,
      completed_at text,
      created_at text NOT NULL,
      updated_at text NOT NULL
    );
    CREATE TABLE user_equipment (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      category text,
      notes text,
      created_at text NOT NULL
    );
    CREATE TABLE user_preferences (
      id text PRIMARY KEY NOT NULL,
      key text NOT NULL UNIQUE,
      value text NOT NULL,
      updated_at text NOT NULL
    );
  `);

  return { db: drizzle(sqlite, { schema }), sqlite };
}
