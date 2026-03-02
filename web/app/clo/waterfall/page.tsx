import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  getProfileForUser,
  getDealForProfile,
  getLatestReportPeriod,
  getReportPeriodData,
  getWaterfallSteps,
  getTranches,
  getTrancheSnapshots,
  getAccountBalances,
  getPanelForUser,
  rowToProfile,
} from "@/lib/clo/access";
import type { ExtractedConstraints } from "@/lib/clo/types";
import WaterfallVisualization from "./WaterfallVisualization";
import ProjectionModel from "./ProjectionModel";
import DataQualityCheck from "./DataQualityCheck";

export default async function WaterfallPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  const profileRow = await getProfileForUser(session.user.id);
  if (!profileRow) {
    redirect("/clo/onboarding");
  }

  const profile = rowToProfile(profileRow as unknown as Record<string, unknown>);
  const deal = await getDealForProfile(profile.id);

  if (!deal) {
    return (
      <div className="ic-dashboard">
        <div className="ic-empty-state">
          <h1>Waterfall Model</h1>
          <p>No deal data available. Upload a compliance report to get started.</p>
        </div>
      </div>
    );
  }

  const reportPeriod = await getLatestReportPeriod(deal.id);

  const [
    waterfallSteps,
    tranches,
    trancheSnapshots,
    periodData,
    accountBalances,
  ] = await Promise.all([
    reportPeriod ? getWaterfallSteps(reportPeriod.id) : Promise.resolve([]),
    getTranches(deal.id),
    reportPeriod ? getTrancheSnapshots(reportPeriod.id) : Promise.resolve([]),
    reportPeriod ? getReportPeriodData(reportPeriod.id) : Promise.resolve(null),
    reportPeriod ? getAccountBalances(reportPeriod.id) : Promise.resolve([]),
  ]);

  const constraints = (profile.extractedConstraints || {}) as ExtractedConstraints;
  const panel = await getPanelForUser(session.user.id);

  // Build deal context for AI features
  const dealContext = {
    dealName: deal.dealName,
    maturityDate: deal.statedMaturityDate,
    reinvestmentPeriodEnd: deal.reinvestmentPeriodEnd,
    poolSummary: periodData?.poolSummary ?? null,
    complianceTests: periodData?.complianceTests ?? [],
    tranches,
    trancheSnapshots,
    accountBalances,
    constraints,
    reportDate: reportPeriod?.reportDate ?? null,
  };

  return (
    <div className="ic-dashboard" style={{ maxWidth: "1200px" }}>
      <h1 style={{ fontFamily: "var(--font-display)", marginBottom: "0.5rem", letterSpacing: "-0.01em" }}>
        Waterfall Model
      </h1>
      {deal.dealName && (
        <p style={{ color: "var(--color-text-muted)", marginBottom: "2rem", fontSize: "0.9rem" }}>
          {deal.dealName}
          {reportPeriod && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem" }}>
              {" "}&middot; {reportPeriod.reportDate}
            </span>
          )}
        </p>
      )}

      {panel && (
        <DataQualityCheck panelId={panel.id} dealContext={dealContext} />
      )}

      <WaterfallVisualization
        waterfallSteps={waterfallSteps}
        tranches={tranches}
        trancheSnapshots={trancheSnapshots}
        complianceTests={periodData?.complianceTests ?? []}
      />

      <ProjectionModel
        deal={deal}
        tranches={tranches}
        trancheSnapshots={trancheSnapshots}
        poolSummary={periodData?.poolSummary ?? null}
        complianceTests={periodData?.complianceTests ?? []}
        constraints={constraints}
        panelId={panel?.id ?? null}
        dealContext={dealContext}
      />
    </div>
  );
}
