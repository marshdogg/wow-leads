ALTER TABLE "deals" ADD COLUMN "lost_reason" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "lost_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "revisit_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stages" ADD COLUMN "semantic_type" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "stages" ADD COLUMN "accent" text;--> statement-breakpoint
ALTER TABLE "stages" ADD COLUMN "show_value_roll" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stages" ADD COLUMN "requires_reason" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stages" ADD COLUMN "neglect_days" integer;--> statement-breakpoint
ALTER TABLE "stages" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stages" ADD COLUMN "locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stages" ADD COLUMN "active" boolean DEFAULT true NOT NULL;