CREATE TABLE "campaign_sends" (
	"id" text PRIMARY KEY NOT NULL,
	"enrolment_id" text NOT NULL,
	"step_number" integer NOT NULL,
	"sent_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "approved_by" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "approved_hash" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "wow_os_job_id" text;--> statement-breakpoint
ALTER TABLE "campaign_sends" ADD CONSTRAINT "campaign_sends_enrolment_id_campaign_enrolments_id_fk" FOREIGN KEY ("enrolment_id") REFERENCES "public"."campaign_enrolments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_sends_date_idx" ON "campaign_sends" USING btree ("sent_on");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_sends_once_idx" ON "campaign_sends" USING btree ("enrolment_id","step_number");--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_enrolments_once_idx" ON "campaign_enrolments" USING btree ("campaign_id","deal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_wow_os_idx" ON "jobs" USING btree ("wow_os_job_id");