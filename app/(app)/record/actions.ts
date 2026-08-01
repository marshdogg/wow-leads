"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { RECORD_TOASTS } from "@/lib/record-fields";
import { setPrimaryContact } from "@/lib/repositories/accounts";

/**
 * Record-screen writes. Thin wrappers over the account repository so the
 * record owns its own server actions without editing `app/actions/deals.ts`.
 */

export interface ActionResult {
  ok: boolean;
  toast: string;
}

const primaryContactInput = z.object({
  dealId: z.string().min(1),
  contactId: z.string().min(1),
  contactName: z.string().min(1),
});

export async function setPrimaryContactAction(
  input: z.infer<typeof primaryContactInput>,
): Promise<ActionResult> {
  const parsed = primaryContactInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, toast: "Could not set the primary contact" };
  }
  const { dealId, contactId, contactName } = parsed.data;

  await setPrimaryContact({ contactId, actorUserId: getCurrentUser().id });
  revalidatePath(`/record/${dealId}`);

  return { ok: true, toast: RECORD_TOASTS.primaryContact(contactName) };
}
