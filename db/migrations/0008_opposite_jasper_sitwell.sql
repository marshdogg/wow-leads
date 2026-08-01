ALTER TABLE "approvals" ALTER COLUMN "trigger_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "campaign_id" text;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "campaign_step_id" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "last_run_count" integer;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_campaign_step_id_campaign_steps_id_fk" FOREIGN KEY ("campaign_step_id") REFERENCES "public"."campaign_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approvals_campaign_idx" ON "approvals" USING btree ("campaign_id");--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_one_source_chk" CHECK ((trigger_type is not null) <> (campaign_id is not null));