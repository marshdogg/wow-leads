import type { Metadata } from "next";
import { CampaignsScreen } from "@/components/campaigns/CampaignsScreen";
import {
  campaignApprovalState,
  type CampaignApprovalState,
} from "@/components/campaigns/draft";
import {
  getAudienceCandidates,
  getCampaigns,
  getJobCompletionStats,
} from "@/lib/repositories/campaigns";
import { getTemplates } from "@/lib/repositories/templates";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Campaigns · WOW Leads" };

/**
 * Every candidate's audience facts are loaded here, once, so the editor can
 * re-size an audience on each keystroke against real records without a round
 * trip. `lib/campaigns/audience.ts` is pure for exactly this reason.
 *
 * `now` is fixed on the server and handed down rather than read in the
 * browser. `job_completed_days_ago` matches an exact day, so a client clock a
 * few hours either side of midnight — or simply in another timezone — would
 * size that audience differently from the runner that actually enrols people,
 * and the count's whole job is to predict what the runner will do.
 */
export default async function CampaignsPage() {
  /*
   * `getJobCompletionStats()` rather than `hasJobCompletions()`, and one call
   * rather than both. `total > 0` answers the same question the boolean does —
   * can a job-based audience be evaluated — while `fromFunnel` answers the one
   * the screen also has to be honest about: every completion we hold today was
   * written by the seed, so a count taken off them demonstrates the rule
   * rather than describing a real audience. Two calls could disagree; one
   * cannot.
   */
  const [campaigns, candidates, templates, completions] = await Promise.all([
    getCampaigns(),
    getAudienceCandidates(),
    getTemplates(),
    getJobCompletionStats(),
  ]);

  // Only what the pin dropdown needs. Handing down whole templates would ship
  // every piece of copy the franchise owns to the browser to fill a select.
  const pinnable = templates
    .filter((t) => t.active)
    .map((t) => ({ id: t.id, name: t.name, channel: t.channel }));

  /*
   * Bulk approval standing, computed here because it hashes the *resolved*
   * body of every step — which is the point of the gate: editing the template
   * a step points at changes what sends just as surely as re-pointing the
   * step, and both have to invalidate the tick.
   */
  const bodyById = new Map(templates.map((t) => [t.id, t.body]));
  const approvalStates: Record<string, CampaignApprovalState> = {};
  for (const campaign of campaigns) {
    const bodyByStep = new Map<number, string>();
    for (const step of campaign.steps) {
      const body = step.templateId ? bodyById.get(step.templateId) : undefined;
      if (body !== undefined) bodyByStep.set(step.stepNumber, body);
    }
    approvalStates[campaign.id] = campaignApprovalState(campaign, bodyByStep);
  }

  return (
    <CampaignsScreen
      campaigns={campaigns}
      candidates={candidates}
      templates={pinnable}
      completions={completions}
      approvalStates={approvalStates}
      nowIso={new Date().toISOString()}
    />
  );
}
