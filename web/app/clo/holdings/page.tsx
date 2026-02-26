import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getProfileForUser, rowToProfile } from "@/lib/clo/access";
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
  const portfolio = cloProfile.extractedPortfolio;

  if (!portfolio || !portfolio.holdings || portfolio.holdings.length === 0) {
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

  return (
    <div className="ic-dashboard">
      <header className="ic-dashboard-header">
        <div>
          <h1>Portfolio Holdings</h1>
          <p>
            {portfolio.holdings.length} positions
            {portfolio.reportDate && <> &middot; Report date: {portfolio.reportDate}</>}
          </p>
        </div>
        <div className="ic-dashboard-actions">
          <Link href="/clo" className="btn-secondary">Back to Dashboard</Link>
        </div>
      </header>

      <section className="ic-section">
        <HoldingsTable holdings={portfolio.holdings} />
      </section>
    </div>
  );
}
