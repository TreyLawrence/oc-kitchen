PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_cook_log` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`verdict` text,
	`notes` text,
	`modifications` text,
	`photos` text,
	`cooked_at` text NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_cook_log`("id", "recipe_id", "verdict", "notes", "modifications", "photos", "cooked_at") SELECT "id", "recipe_id", "verdict", "notes", "modifications", "photos", "cooked_at" FROM `cook_log`;--> statement-breakpoint
DROP TABLE `cook_log`;--> statement-breakpoint
ALTER TABLE `__new_cook_log` RENAME TO `cook_log`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `recipes` ADD `passive_minutes` integer;