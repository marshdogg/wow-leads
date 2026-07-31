CREATE TABLE "access_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"body" text NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"line" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"details" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"trigger_type" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"chip" text DEFAULT 'SEQUENCE STEP' NOT NULL,
	"channel" text NOT NULL,
	"recipient" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"footnote" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'drafted' NOT NULL,
	"agent_id" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"user_id" text,
	"agent_id" text,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"initials" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"prefers" text DEFAULT 'EMAIL' NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" text PRIMARY KEY NOT NULL,
	"pipeline_id" text NOT NULL,
	"stage_id" text NOT NULL,
	"track" text,
	"name" text NOT NULL,
	"account_line" text DEFAULT '' NOT NULL,
	"account_id" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text NOT NULL,
	"owner_user_id" text,
	"owner_agent_id" text,
	"owner_initials" text NOT NULL,
	"owner_name" text NOT NULL,
	"owner_is_agent" boolean DEFAULT false NOT NULL,
	"assigned_by" text DEFAULT 'Self-sourced' NOT NULL,
	"ai_pending" boolean DEFAULT false NOT NULL,
	"stale" text DEFAULT '' NOT NULL,
	"stale_warn" boolean DEFAULT false NOT NULL,
	"last_touch_at" timestamp with time zone,
	"metrics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sequence_id" text,
	"seq" integer,
	"seq_name" text,
	"seq_step" text,
	"next_label" text,
	"next_due" text,
	"next_state" text,
	"next_due_at" timestamp with time zone,
	"act" text DEFAULT 'Log Call' NOT NULL,
	"quick" boolean DEFAULT true NOT NULL,
	"os_ref" text,
	"initial_type" text,
	"result_outcome" text,
	"retry_at" text,
	"promo_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"region" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipelines" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"meta" text NOT NULL,
	"dot" text NOT NULL,
	"title" text NOT NULL,
	"sub" text NOT NULL,
	"filter_label" text NOT NULL,
	"has_tracks" boolean DEFAULT false NOT NULL,
	"show_stage_value" boolean DEFAULT false NOT NULL,
	"neglect_days" integer DEFAULT 14 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promos" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"label" text NOT NULL,
	"discount" text NOT NULL,
	"window_start" timestamp with time zone,
	"window_end" timestamp with time zone,
	"authored_by" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequence_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"sequence_id" text NOT NULL,
	"step_number" integer NOT NULL,
	"label" text NOT NULL,
	"channel" text DEFAULT 'EMAIL' NOT NULL,
	"delay_days" integer DEFAULT 3 NOT NULL,
	"template" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequences" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"step_count" integer DEFAULT 4 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stages" (
	"id" text PRIMARY KEY NOT NULL,
	"pipeline_id" text NOT NULL,
	"label" text NOT NULL,
	"hint" text DEFAULT '' NOT NULL,
	"sort_order" integer NOT NULL,
	"positive" boolean DEFAULT false NOT NULL,
	"title_color" text
);
--> statement-breakpoint
CREATE TABLE "touchpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"account_id" text,
	"channel" text NOT NULL,
	"body" text NOT NULL,
	"who" text NOT NULL,
	"by_agent" boolean DEFAULT false NOT NULL,
	"initials" text DEFAULT '' NOT NULL,
	"user_id" text,
	"agent_id" text,
	"structured" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"initials" text NOT NULL,
	"role" text DEFAULT 'rep' NOT NULL,
	"location_id" text,
	"board_prefs" jsonb DEFAULT '{"collapsedCols":{},"listSort":{"key":"next","dir":1}}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_notes" ADD CONSTRAINT "access_notes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_notes" ADD CONSTRAINT "access_notes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_promo_id_promos_id_fk" FOREIGN KEY ("promo_id") REFERENCES "public"."promos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promos" ADD CONSTRAINT "promos_authored_by_users_id_fk" FOREIGN KEY ("authored_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "touchpoints" ADD CONSTRAINT "touchpoints_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "touchpoints" ADD CONSTRAINT "touchpoints_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "touchpoints" ADD CONSTRAINT "touchpoints_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_notes_account_idx" ON "access_notes" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "approvals_deal_idx" ON "approvals" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "approvals_status_idx" ON "approvals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_events" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "contacts_account_idx" ON "contacts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "deals_pipeline_idx" ON "deals" USING btree ("pipeline_id");--> statement-breakpoint
CREATE INDEX "deals_stage_idx" ON "deals" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "deals_account_idx" ON "deals" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "deals_last_touch_idx" ON "deals" USING btree ("last_touch_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sequence_steps_order_idx" ON "sequence_steps" USING btree ("sequence_id","step_number");--> statement-breakpoint
CREATE INDEX "stages_pipeline_idx" ON "stages" USING btree ("pipeline_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stages_pipeline_order_idx" ON "stages" USING btree ("pipeline_id","sort_order");--> statement-breakpoint
CREATE INDEX "touchpoints_deal_idx" ON "touchpoints" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "touchpoints_account_idx" ON "touchpoints" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "touchpoints_occurred_idx" ON "touchpoints" USING btree ("occurred_at");