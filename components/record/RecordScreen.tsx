import Link from "next/link";
import { tagStyle } from "@/lib/pipelines";
import { RECORD_FIELDS } from "@/lib/record-fields";
import { ActivityTimeline } from "./ActivityTimeline";
import { ContactsPanel } from "./ContactsPanel";
import { MetaPanel } from "./MetaPanel";
import { NextStepPanel } from "./NextStepPanel";
import { PropertyPanel } from "./PropertyPanel";
import { RecordActions } from "./RecordActions";
import { suggestionBodies } from "./suggestion-copy";
import { SuggestionsPanel } from "./SuggestionsPanel";
import {
  accountTags,
  metaRows,
  nextStepStyle,
  orderedContacts,
  type RecordView,
} from "./view-model";

/**
 * The Account record: one page holding the account, its contacts, the site
 * detail a crew needs, and every touch anyone — person or agent — has made.
 */
export function RecordScreen({ view }: { view: RecordView }) {
  const { deal, account } = view;
  const tags = accountTags(view);
  const contacts = orderedContacts(view.contacts);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 600,
        overflowY: "auto",
        padding: "16px 28px 32px",
      }}
    >
      <Link
        href="/board"
        className="hover:!text-[#b6f07a]"
        style={{
          display: "inline-block",
          fontSize: 13,
          color: "#8b948b",
          marginBottom: 12,
        }}
      >
        ← {RECORD_FIELDS.backLabel}
      </Link>

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: "1px",
              color: "#6f7a6f",
              fontWeight: 600,
            }}
          >
            {RECORD_FIELDS.accountEyebrow}
          </div>
          <h1
            style={{
              fontSize: 30,
              fontWeight: 600,
              letterSpacing: "-0.6px",
              margin: "3px 0 0",
            }}
          >
            {account.name}
          </h1>
          <div
            style={{
              display: "flex",
              gap: 6,
              marginTop: 10,
              flexWrap: "wrap",
            }}
          >
            {tags.map((t) => {
              const s = tagStyle(t);
              return (
                <span
                  key={t}
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.9px",
                    fontWeight: 600,
                    padding: "5px 8px",
                    borderRadius: 4,
                    background: s.bg,
                    color: s.color,
                  }}
                >
                  {t}
                </span>
              );
            })}
          </div>
        </div>

        <RecordActions
          dealId={deal.id}
          dealName={deal.name}
          address={deal.account}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: 18,
          marginTop: 22,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <ContactsPanel dealId={deal.id} contacts={contacts} />
          <PropertyPanel
            details={account.details}
            accessNotes={view.accessNotes}
          />
          <ActivityTimeline timeline={view.timeline} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <MetaPanel rows={metaRows(view)} />
          <NextStepPanel dealId={deal.id} style={nextStepStyle(deal)} />
          <SuggestionsPanel
            dealId={deal.id}
            bodies={suggestionBodies(view)}
          />
        </div>
      </div>
    </div>
  );
}
