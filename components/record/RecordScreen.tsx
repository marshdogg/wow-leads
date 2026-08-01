import Link from "next/link";
import { tagStyle } from "@/lib/pipelines";
import { RECORD_FIELDS } from "@/lib/record-fields";
import { ActivityTimeline } from "./ActivityTimeline";
import { ContactsPanel } from "./ContactsPanel";
import { MetaPanel } from "./MetaPanel";
import { NextStepPanel } from "./NextStepPanel";
import { PropertyPanel } from "./PropertyPanel";
import { RecordActions } from "./RecordActions";
import { SourcedLeads, type SourcedLead } from "./SourcedLeads";
import { suggestionBodies } from "./suggestion-copy";
import { SuggestionsPanel } from "./SuggestionsPanel";
import {
  accountTags,
  metaRows,
  nextStepStyle,
  orderedContacts,
  type OriginJob,
  type RecordView,
} from "./view-model";

/**
 * The Account record: one page holding the account, its contacts, the site
 * detail a crew needs, and every touch anyone — person or agent — has made.
 */
export function RecordScreen({
  view,
  origin = null,
  sourcedLeads = [],
  sourcedLeadsValue = "$0",
}: {
  view: RecordView;
  /** The job this lead came off, if it came off one. */
  origin?: OriginJob | null;
  /** Leads this record produced — populated when this record is the job. */
  sourcedLeads?: SourcedLead[];
  /** Their combined value, summed from raw metrics by the repository. */
  sourcedLeadsValue?: string;
}) {
  const { deal, account } = view;
  const tags = accountTags(view);
  const contacts = orderedContacts(view.contacts);

  return (
    // Gutter matches the top bar's `px-4 sm:px-7`; 28px each side of a 390px
    // phone is most of the screen.
    <div
      className="px-4 pt-4 pb-8 sm:px-7"
      style={{ flex: 1, minHeight: 600, overflowY: "auto" }}
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
          {/* On a job record the account name *is* the address line, which is
              what the attribution e2e reads to match against a lead's origin
              row. Hence one element, both roles. */}
          <h1
            data-testid="account-line"
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

      {/* Stacks below md. `grid-template-columns` lives in the class, not the
          style object, so the responsive variant isn't overridden inline. */}
      <div
        className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr]"
        style={{ gap: 18, marginTop: 22, alignItems: "start" }}
      >
        <div className="flex min-w-0 flex-col" style={{ gap: 18 }}>
          <ContactsPanel dealId={deal.id} contacts={contacts} />
          <PropertyPanel
            details={account.details}
            accessNotes={view.accessNotes}
          />
          <ActivityTimeline timeline={view.timeline} />
          <SourcedLeads leads={sourcedLeads} totalValue={sourcedLeadsValue} />
        </div>

        <div className="flex min-w-0 flex-col" style={{ gap: 18 }}>
          <MetaPanel rows={metaRows(view, origin)} />
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
