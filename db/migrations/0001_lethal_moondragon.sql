ALTER TABLE "deals" ADD COLUMN "sourced_from_deal_id" text;--> statement-breakpoint
ALTER TABLE "pipelines" ADD COLUMN "track_options" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_sourced_from_deal_id_deals_id_fk" FOREIGN KEY ("sourced_from_deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deals_sourced_from_idx" ON "deals" USING btree ("sourced_from_deal_id");