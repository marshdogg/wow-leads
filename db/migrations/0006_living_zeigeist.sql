CREATE TABLE "campaign_enrolments" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"deal_id" text NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"current_step" integer DEFAULT 1 NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"exit_reason" text
);
--> statement-breakpoint
CREATE TABLE "campaign_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"step_number" integer NOT NULL,
	"delay_days" integer DEFAULT 0 NOT NULL,
	"channel" text DEFAULT 'EMAIL' NOT NULL,
	"template_id" text,
	"label" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'RESIDENTIAL LEADS' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"audience_kind" text NOT NULL,
	"audience_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"approval_mode" text DEFAULT 'per_message' NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"reenrol_after_days" integer,
	"authored_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"deal_id" text,
	"completed_at" timestamp with time zone NOT NULL,
	"work_type" text NOT NULL,
	"scope" text DEFAULT '' NOT NULL,
	"areas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"value_cents" integer DEFAULT 0 NOT NULL,
	"crew" text
);
--> statement-breakpoint
ALTER TABLE "campaign_enrolments" ADD CONSTRAINT "campaign_enrolments_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_enrolments" ADD CONSTRAINT "campaign_enrolments_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_steps" ADD CONSTRAINT "campaign_steps_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_steps" ADD CONSTRAINT "campaign_steps_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_authored_by_users_id_fk" FOREIGN KEY ("authored_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_enrolments_campaign_idx" ON "campaign_enrolments" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_enrolments_deal_idx" ON "campaign_enrolments" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "campaign_enrolments_state_idx" ON "campaign_enrolments" USING btree ("state");--> statement-breakpoint
CREATE INDEX "campaign_steps_campaign_idx" ON "campaign_steps" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_steps_order_idx" ON "campaign_steps" USING btree ("campaign_id","step_number");--> statement-breakpoint
CREATE INDEX "jobs_account_idx" ON "jobs" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "jobs_completed_idx" ON "jobs" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "jobs_deal_idx" ON "jobs" USING btree ("deal_id");