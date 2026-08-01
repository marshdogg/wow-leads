"use client";

import { useTransition } from "react";
import { setPrimaryContactAction } from "@/app/(app)/record/actions";
import { RECORD_FIELDS, RECORD_TOASTS } from "@/lib/record-fields";
import { useUi } from "@/lib/store/ui";
import type { Contact } from "@/lib/types";
import { Panel, SectionLabel } from "./Panel";

/**
 * Contacts on the account, primary first and visually pinned — the primary
 * contact is who a trigger drafts to, so which one it is has to be obvious
 * and one click to change.
 */
export function ContactsPanel({
  dealId,
  contacts,
}: {
  dealId: string;
  contacts: Contact[];
}) {
  const showToast = useUi((s) => s.showToast);
  const [pending, startTransition] = useTransition();

  const selectPrimary = (contact: Contact) => {
    if (contact.primary || pending) return;
    startTransition(async () => {
      const res = await setPrimaryContactAction({
        dealId,
        contactId: contact.id,
        contactName: contact.name,
      });
      showToast(res.toast);
    });
  };

  return (
    <Panel>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <SectionLabel>
          {RECORD_FIELDS.contactsHeading} · {contacts.length}{" "}
          {RECORD_FIELDS.contactsHeadingSuffix}
        </SectionLabel>
        <button
          type="button"
          onClick={() => showToast(RECORD_TOASTS.addContact)}
          className="hover:!text-[#a8ea6b]"
          style={{
            fontSize: 12,
            color: "#8fdc4a",
            cursor: "pointer",
            background: "transparent",
            border: "none",
            padding: 0,
          }}
        >
          {RECORD_FIELDS.addContact}
        </button>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginTop: 13,
        }}
      >
        {contacts.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={c.primary}
            onClick={() => selectPrimary(c)}
            className="hover:!border-[#4b9c2d]"
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              fontFamily: "inherit",
              fontSize: 14,
              color: "#e9ede9",
              border: `1px solid ${c.primary ? "#2f6b1f" : "#262b25"}`,
              background: c.primary ? "#0f1a0b" : "#141814",
              borderRadius: 11,
              padding: "13px 15px",
              cursor: c.primary ? "default" : "pointer",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    flex: "none",
                    borderRadius: "50%",
                    background: "#22301b",
                    color: "#a8ea6b",
                    fontSize: 11,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {c.initials}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{c.name}</div>
                  <div
                    style={{ fontSize: 12, color: "#7d877d", marginTop: 1 }}
                  >
                    {c.role}
                  </div>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.8px",
                    fontWeight: 600,
                    padding: "4px 8px",
                    borderRadius: 4,
                    background: "#241f2e",
                    color: "#b19ad6",
                  }}
                >
                  {RECORD_FIELDS.prefersPrefix} {c.prefers}
                </span>
                <span style={{ fontSize: 12, color: "#8b948b" }}>
                  {c.contact}
                </span>
              </div>
            </div>

            {c.notes ? (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  color: "#8b948b",
                  lineHeight: 1.5,
                  borderLeft: "1px solid #2a2f28",
                  paddingLeft: 11,
                }}
              >
                {c.notes}
              </div>
            ) : null}
          </button>
        ))}
      </div>
    </Panel>
  );
}
