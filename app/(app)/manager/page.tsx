import type { Metadata } from "next";
import { DashPanel } from "@/components/manager/DashPanel";
import { JobSiteAttribution } from "@/components/manager/JobSiteAttribution";
import { Leaderboard } from "@/components/manager/Leaderboard";
import { NeglectedPanel } from "@/components/manager/NeglectedPanel";
import { PipelineHealth } from "@/components/manager/PipelineHealth";
import { RevisitDuePanel } from "@/components/manager/RevisitDuePanel";
import { ProspectMetrics } from "@/components/manager/ProspectMetrics";
import { SourceRoi } from "@/components/manager/SourceRoi";
import {
  getLeaderboard,
  getNeglectedValue,
  getPipelineHealth,
  getProspectMetrics,
  getSourceRoi,
} from "@/lib/repositories/analytics";
import {
  getJobSiteAttribution,
  getNeglectedDeals,
  getRevisitDue,
} from "@/lib/repositories/deals";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Manager dashboard · WOW Leads" };

export default async function ManagerPage() {
  const [
    neglected,
    revisitDue,
    neglectedValue,
    leaderboard,
    health,
    sourceRoi,
    prospectMetrics,
    jobSite,
  ] = await Promise.all([
    getNeglectedDeals(),
    getRevisitDue(),
    getNeglectedValue(),
    getLeaderboard(),
    getPipelineHealth(),
    getSourceRoi(),
    getProspectMetrics(),
    getJobSiteAttribution(),
  ]);

  return (
    // Gutter matches the top bar's `px-4 sm:px-7`.
    <div
      className="px-4 pt-[18px] pb-8 sm:px-7"
      style={{ flex: 1, minHeight: 600, overflowY: "auto" }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: "-0.5px",
            margin: 0,
          }}
        >
          Manager dashboard
        </h1>
        <div style={{ fontSize: 13, color: "#7d877d" }}>
          Inputs and outputs — effort on the left, revenue on the right.
        </div>
      </div>

      {/* Two signals, adjacent and distinct. Neglect is "nobody is on this";
          revisit-due is "the date you chose has arrived". Stacking them keeps
          both in the manager's first screenful without letting either borrow
          the other's urgency. */}
      <NeglectedPanel rows={neglected} total={neglectedValue} />
      <RevisitDuePanel rows={revisitDue} />

      {/* Stacks below md — effort above, outcomes below. */}
      <div
        className="grid grid-cols-1 md:grid-cols-[1.15fr_1fr]"
        style={{ gap: 18, marginTop: 18, alignItems: "start" }}
      >
        <DashPanel>
          <Leaderboard rows={leaderboard} />
          <SourceRoi rows={sourceRoi} />
        </DashPanel>

        <div
          className="flex min-w-0 flex-col"
          style={{ gap: 18 }}
        >
          <JobSiteAttribution data={jobSite} />
          <PipelineHealth rows={health} />
          <ProspectMetrics stats={prospectMetrics} />
        </div>
      </div>
    </div>
  );
}
