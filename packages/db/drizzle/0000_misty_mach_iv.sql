CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`trace_id` text NOT NULL,
	`span_id` text,
	`name` text NOT NULL,
	`level` text DEFAULT 'info' NOT NULL,
	`body` text,
	`metadata` text,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`trace_id`) REFERENCES `traces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`span_id`) REFERENCES `spans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`api_key` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_api_key_unique` ON `projects` (`api_key`);--> statement-breakpoint
CREATE TABLE `scores` (
	`id` text PRIMARY KEY NOT NULL,
	`trace_id` text NOT NULL,
	`span_id` text,
	`name` text NOT NULL,
	`value` real NOT NULL,
	`comment` text,
	`source` text DEFAULT 'human' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`trace_id`) REFERENCES `traces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`span_id`) REFERENCES `spans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `spans` (
	`id` text PRIMARY KEY NOT NULL,
	`trace_id` text NOT NULL,
	`parent_span_id` text,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`input` text,
	`output` text,
	`error` text,
	`model` text,
	`provider` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`cost` real,
	`tool_name` text,
	`tool_args` text,
	`tool_result` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`duration_ms` integer,
	`metadata` text,
	FOREIGN KEY (`trace_id`) REFERENCES `traces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `traces` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`name` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`input` text,
	`output` text,
	`error` text,
	`total_duration_ms` integer,
	`total_tokens` integer,
	`total_cost` real,
	`metadata` text,
	`tags` text,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
