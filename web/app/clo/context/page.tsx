import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  getProfileForUser,
  getDealForProfile,
  getLatestReportPeriod,
  getReportPeriodData,
  rowToProfile,
} from "@/lib/clo/access";
import type { ExtractedConstraints } from "@/lib/clo/types";
import ContextEditor from "./ContextEditor";

export default async function ContextPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  const profileRow = await getProfileForUser(session.user.id);
  if (!profileRow) {
    redirect("/clo/onboarding");
  }

  const profile = rowToProfile(profileRow as unknown as Record<string, unknown>);
  const constraints = (profile.extractedConstraints || {}) as ExtractedConstraints;

  const fundProfile = {
    fundStrategy: profile.fundStrategy,
    targetSectors: profile.targetSectors,
    riskAppetite: profile.riskAppetite,
    portfolioSize: profile.portfolioSize,
    reinvestmentPeriod: profile.reinvestmentPeriod,
    concentrationLimits: profile.concentrationLimits,
    covenantPreferences: profile.covenantPreferences,
    ratingThresholds: profile.ratingThresholds,
    spreadTargets: profile.spreadTargets,
    regulatoryConstraints: profile.regulatoryConstraints,
    portfolioDescription: profile.portfolioDescription,
    beliefsAndBiases: profile.beliefsAndBiases,
  };

  let complianceData = null;
  const deal = await getDealForProfile(profile.id);
  if (deal) {
    const latestPeriod = await getLatestReportPeriod(deal.id);
    if (latestPeriod) {
      const periodData = await getReportPeriodData(latestPeriod.id);
      complianceData = {
        reportPeriodId: latestPeriod.id,
        reportDate: latestPeriod.reportDate,
        poolSummary: periodData.poolSummary,
        complianceTests: periodData.complianceTests,
        concentrations: periodData.concentrations,
      };
    }
  }

  return (
    <div className="ic-content">
      <div className="standalone-header">
        <h1>Context Editor</h1>
        <p style={{ color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>
          View and edit the extracted data that feeds into every analysis and chat interaction.
        </p>
      </div>
      <ContextEditor
        constraints={constraints}
        fundProfile={fundProfile}
        complianceData={complianceData}
      />
    </div>
  );
}
