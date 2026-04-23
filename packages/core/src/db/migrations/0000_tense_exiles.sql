CREATE TABLE `cook_log` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`verdict` text NOT NULL,
	`notes` text,
	`modifications` text,
	`photos` text,
	`cooked_at` text NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `grocery_items` (
	`id` text PRIMARY KEY NOT NULL,
	`grocery_list_id` text NOT NULL,
	`name` text NOT NULL,
	`quantity` real,
	`unit` text,
	`category` text,
	`store` text,
	`is_checked` integer DEFAULT false,
	`recipe_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`grocery_list_id`) REFERENCES `grocery_lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `grocery_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_plan_id` text,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`meal_plan_id`) REFERENCES `meal_plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `grocery_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`grocery_list_id` text NOT NULL,
	`store` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`agent_run_id` text,
	`order_total` real,
	`error_message` text,
	`started_at` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`grocery_list_id`) REFERENCES `grocery_lists`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text,
	`quantity` real,
	`unit` text,
	`location` text,
	`expires_at` text,
	`purchased_at` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meal_plan_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_plan_id` text NOT NULL,
	`recipe_id` text,
	`day_of_week` integer NOT NULL,
	`meal_type` text NOT NULL,
	`custom_title` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`meal_plan_id`) REFERENCES `meal_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `meal_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`week_start` text NOT NULL,
	`week_end` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recipe_ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`name` text NOT NULL,
	`quantity` real,
	`unit` text,
	`category` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`source` text NOT NULL,
	`source_url` text,
	`servings` integer,
	`prep_minutes` integer,
	`cook_minutes` integer,
	`instructions` text NOT NULL,
	`verdict` text,
	`is_favorite` integer DEFAULT false,
	`tags` text,
	`notes` text,
	`image_url` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_equipment` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text,
	`notes` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_preferences_key_unique` ON `user_preferences` (`key`);