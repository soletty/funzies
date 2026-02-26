import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getProfileForUser, rowToProfile, getDealForProfile, getLatestReportPeriod, getHoldings } from "@/lib/clo/access";
import Link from "next/link";
import HoldingsTable from "./HoldingsTable";

export default async function HoldingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  const profile = await getProfileForUser(session.user.id);
  if (!profile) {
    redirect("/clo/onboarding");
  }

  const cloProfile = rowToProfile(profile as unknown as Record<string, unknown>);

  // Try new extraction tables first
  const deal = await getDealForProfile(cloProfile.id);
  let expandedHoldings: Awaited<ReturnType<typeof getHoldings>> = [];
  let reportDate: string | null = null;

  if (deal) {
    const period = await getLatestReportPeriod(deal.id);
    if (period) {
      expandedHoldings = await getHoldings(period.id);
      reportDate = period.reportDate;
    }
  }

  // Fall back to legacy data
  const legacyPortfolio = cloProfile.extractedPortfolio;
  const hasExpanded = expandedHoldings.length > 0;
  const hasLegacy = !hasExpanded && legacyPortfolio?.holdings && legacyPortfolio.holdings.length > 0;

  if (!hasExpanded && !hasLegacy) {
    return (
      <div className="ic-dashboard">
        <div className="ic-empty-state">
          <h1>Holdings</h1>
          <p>No portfolio data extracted yet. Upload a compliance report and extract portfolio data from the dashboard.</p>
          <Link href="/clo" className="btn-primary">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  const totalCount = hasExpanded ? expandedHoldings.length : legacyPortfolio!.holdings.length;
  const displayDate = reportDate ?? legacyPortfolio?.reportDate;

  return (
    <div className="ic-dashboard">
      <header className="ic-dashboard-header">
        <div>
          <h1>Portfolio Holdings</h1>
          <p>
            {totalCount} positions
            {displayDate && <> &middot; Report date: {displayDate}</>}
          </p>
        </div>
        <div className="ic-dashboard-actions">
          <Link href="/clo" className="btn-secondary">Back to Dashboard</Link>
        </div>
      </header>

      <section className="ic-section">
        {hasExpanded ? (
          <HoldingsTable expandedHoldings={expandedHoldings} mode="expanded" />
        ) : (
          <HoldingsTable holdings={legacyPortfolio!.holdings} mode="legacy" />
        )}
      </section>
    </div>
  );
}
