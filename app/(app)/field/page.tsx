import { getDeal } from "@/lib/repositories/deals";
import { getAccountView } from "@/lib/repositories/accounts";
import { FieldScreen } from "@/components/field/FieldScreen";

export const dynamic = "force-dynamic";

/**
 * The rep's current lead. v1 pins the field surface to the hero deal; the real
 * thing resolves it from the rep's route for the day.
 */
const FIELD_DEAL_ID = "r1";

export default async function FieldPage() {
  const deal = await getDeal(FIELD_DEAL_ID).catch(() => null);

  if (!deal) {
    return (
      <div style={{ flex: 1, padding: "18px 28px 30px" }}>
        <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.5px" }}>
          Field view
        </div>
        <div
          style={{
            marginTop: 18,
            border: "1px dashed #2a2f28",
            borderRadius: 13,
            padding: 40,
            textAlign: "center",
            color: "#5c655c",
            fontSize: 14,
          }}
        >
          No lead on the route yet — run <code>pnpm seed</code> to load the demo
          pipeline.
        </div>
      </div>
    );
  }

  // The preference chip is a contact fact, not a deal tag.
  const view = await getAccountView(deal.id).catch(() => null);
  const contact =
    view?.contacts.find((c) => c.primary) ?? view?.contacts[0] ?? null;

  return <FieldScreen deal={deal} prefersChannel={contact?.prefers ?? null} />;
}
