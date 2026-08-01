import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecordScreen } from "@/components/record/RecordScreen";
import { getAccountView } from "@/lib/repositories/accounts";

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
  return <RecordScreen view={view} />;
}
