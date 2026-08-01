/**
 * The Record screen's read model: one deal, its account, everyone attached to
 * it, the access notes crews need, and the full provenance timeline.
 */

import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accessNotes, accounts, contacts, deals, pipelines } from "@/db/schema";
import { appendAudit } from "./audit";
import { toAccount, toContact, toDeal, toTouchpoint } from "./mappers";
import { touchpoints } from "@/db/schema";
import type { Account, Contact, Deal, Touchpoint } from "@/lib/types";

export interface AccountView {
  deal: Deal;
  account: Account;
  contacts: Contact[];
  accessNotes: string;
  timeline: Touchpoint[];
  meta: { label: string; value: string; color: string }[];
}

const NO_ACCESS_NOTES = "No access notes yet — capture on the first site visit.";

export async function getAccountView(dealId: string): Promise<AccountView | null> {
  const [dealRow] = await db
    .select()
    .from(deals)
    .where(eq(deals.id, dealId))
    .limit(1);
  if (!dealRow) return null;

  const accountId = dealRow.accountId;

  const [accountRow] = accountId
    ? await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1)
    : [];

  const [contactRows, accessRows, timelineRows, pipeRows] = await Promise.all([
    accountId
      ? db
          .select()
          .from(contacts)
          .where(eq(contacts.accountId, accountId))
          .orderBy(desc(contacts.isPrimary), asc(contacts.name))
      : Promise.resolve([]),
    accountId
      ? db
          .select()
          .from(accessNotes)
          .where(eq(accessNotes.accountId, accountId))
          .limit(1)
      : Promise.resolve([]),
    db
      .select()
      .from(touchpoints)
      .where(eq(touchpoints.dealId, dealId))
      .orderBy(desc(touchpoints.occurredAt)),
    db.select().from(pipelines).where(eq(pipelines.id, dealRow.pipelineId)).limit(1),
  ]);

  const accessBody = accessRows[0]?.body ?? NO_ACCESS_NOTES;
  const mappedContacts = contactRows.map(toContact);
  const primary = mappedContacts.find((c) => c.primary) ?? mappedContacts[0];

  const account: Account = accountRow
    ? toAccount(accountRow, accessBody)
    : {
        id: `acct-${dealRow.id}`,
        name: dealRow.accountLine,
        tags: dealRow.tags,
        details: [],
        accessNotes: accessBody,
      };

  // Record-screen meta block — prototype lines 1399–1406. An assignment that
  // came from a trigger or a partner ("→") is highlighted green: provenance is
  // the point of the block.
  const meta = [
    { label: "Lead source", value: dealRow.source, color: "#e2e7e2" },
    {
      label: "Assigned by",
      value: dealRow.assignedBy,
      color: dealRow.assignedBy.includes("→") ? "#b6f07a" : "#e2e7e2",
    },
    { label: "Owner", value: dealRow.ownerName, color: "#e2e7e2" },
    {
      label: "Pipeline",
      value: pipeRows[0]?.label ?? dealRow.pipelineId,
      color: "#e2e7e2",
    },
    { label: "Business type", value: dealRow.tags[0] ?? "—", color: "#e2e7e2" },
    {
      label: "Preferred contact",
      value:
        primary?.prefers === "EMAIL"
          ? "Email"
          : primary?.prefers === "PHONE"
            ? "Phone"
            : (primary?.prefers ?? "Email"),
      color: "#e2e7e2",
    },
  ];

  return {
    deal: toDeal(dealRow),
    account,
    contacts: mappedContacts,
    accessNotes: accessBody,
    timeline: timelineRows.map(toTouchpoint),
    meta,
  };
}

export async function setPrimaryContact(input: {
  contactId: string;
  actorUserId: string;
}): Promise<void> {
  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, input.contactId))
    .limit(1);
  if (!contact) throw new Error(`Contact "${input.contactId}" not found.`);

  const [previous] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.accountId, contact.accountId))
    .orderBy(desc(contacts.isPrimary))
    .limit(1);

  await db
    .update(contacts)
    .set({ isPrimary: false })
    .where(eq(contacts.accountId, contact.accountId));
  await db
    .update(contacts)
    .set({ isPrimary: true })
    .where(eq(contacts.id, input.contactId));

  await appendAudit({
    entity: "account",
    entityId: contact.accountId,
    action: "set_primary_contact",
    userId: input.actorUserId,
    before: { primaryContactId: previous?.id ?? null },
    after: { primaryContactId: input.contactId },
  });
}
