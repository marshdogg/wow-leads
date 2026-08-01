import type { Metadata } from "next";
import { TemplatesScreen } from "@/components/templates/TemplatesScreen";
import { getAllDeals } from "@/lib/repositories/deals";
import {
  getTemplateFactsFor,
  getTemplates,
} from "@/lib/repositories/templates";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Templates · WOW Leads" };

/**
 * Facts for every preview candidate are loaded here, once, so the editor can
 * re-render its preview on each keystroke against real records without a round
 * trip. `lib/templates/resolve.ts` is pure for exactly this reason.
 */
export default async function TemplatesPage() {
  const [templates, deals] = await Promise.all([
    getTemplates(),
    getAllDeals(),
  ]);

  const previewDeals = deals.map((d) => ({
    id: d.id,
    name: `${d.name} · ${d.account}`,
  }));
  const facts = await getTemplateFactsFor(deals.map((d) => d.id));

  return (
    <TemplatesScreen
      templates={templates}
      deals={previewDeals}
      facts={facts}
    />
  );
}
