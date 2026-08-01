CREATE TABLE "canvass_targets" (
	"id" text PRIMARY KEY NOT NULL,
	"source_deal_id" text NOT NULL,
	"address" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"deal_id" text,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canvass_targets" ADD CONSTRAINT "canvass_targets_source_deal_id_deals_id_fk" FOREIGN KEY ("source_deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvass_targets" ADD CONSTRAINT "canvass_targets_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "canvass_targets_source_idx" ON "canvass_targets" USING btree ("source_deal_id");--> statement-breakpoint
CREATE INDEX "canvass_targets_status_idx" ON "canvass_targets" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "canvass_targets_address_idx" ON "canvass_targets" USING btree ("source_deal_id","address");