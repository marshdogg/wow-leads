import type { Metadata } from "next";
import { DashPanel } from "@/components/manager/DashPanel";
import { Leaderboard } from "@/components/manager/Leaderboard";
import { NeglectedPanel } from "@/components/manager/NeglectedPanel";
import { PipelineHealth } from "@/components/manager/PipelineHealth";
import { ProspectMetrics } from "@/components/manager/ProspectMetrics";
import { SourceRoi } from "@/components/manager/SourceRoi";
import {
  getLeaderboard,
  getNeglectedValue,
  getPipelineHealth,
  getProspectMetrics,
  getSourceRoi,
} from "@/lib/repositories/analytics";
import { getNeglectedDeals } from "@/lib/repositories/deals";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Manager dashboard · WOW Leads" };

export default async function ManagerPage() {
  const [
    neglected,
    neglectedValue,
    leaderboard,
    health,
    sourceRoi,
    prospectMetrics,
  ] = await Promise.all([
    getNeglectedDeals(),
    getNeglectedValue(),
    getLeaderboard(),
    getPipelineHealth(),
    getSourceRoi(),
    getProspectMetrics(),
  ]);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 600,
        overflowY: "auto",
        padding: "18px 28px 32px",
      }}
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

      <NeglectedPanel rows={neglected} total={neglectedValue} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.15fr 1fr",
          gap: 18,
          marginTop: 18,
          alignItems: "start",
        }}
      >
        <DashPanel>
          <Leaderboard rows={leaderboard} />
          <SourceRoi rows={sourceRoi} />
        </DashPanel>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <PipelineHealth rows={health} />
          <ProspectMetrics stats={prospectMetrics} />
        </div>
      </div>
    </div>
  );
}
