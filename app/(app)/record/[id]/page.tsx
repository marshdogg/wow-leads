import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecordScreen } from "@/components/record/RecordScreen";
import { getAccountView } from "@/lib/repositories/accounts";
import {
  getDeal,
  getLeadsSourcedFrom,
  getSourcedLeadSummary,
} from "@/lib/repositories/deals";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const view = await getAccountView(id);
  return { title: view ? `${view.account.name} · WOW Leads` : "WOW Leads" };
}

export default async function RecordPage({ params }: Params) {
  const { id } = await params;
  const view = await getAccountView(id);
  if (!view) notFound();

  // Job-site attribution runs both ways: the job this lead came off, and the
  // leads this job produced. A record is normally one or the other, so both
  // lookups are cheap and independent.
  const [origin, sourcedLeads, sourcedSummary] = await Promise.all([
    view.deal.sourcedFromDealId
      ? getDeal(view.deal.sourcedFromDealId)
      : Promise.resolve(null),
    getLeadsSourcedFrom(id),
    getSourcedLeadSummary(id),
  ]);

  return (
    <RecordScreen
      view={view}
      origin={origin ? { id: origin.id, account: origin.account } : null}
      sourcedLeads={sourcedLeads}
      sourcedLeadsValue={sourcedSummary.value}
    />
  );
}
