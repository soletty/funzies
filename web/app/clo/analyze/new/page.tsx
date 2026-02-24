import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getPanelForUser } from "@/lib/clo/access";
import AnalysisForm from "@/components/clo/AnalysisForm";

export default async function NewAnalysisPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const panel = await getPanelForUser(session.user.id);
  if (!panel || panel.status !== "active") {
    redirect("/clo");
  }

  return (
    <div className="ic-content">
      <div className="ic-form-page">
        <div className="standalone-header">
          <h1>New Loan Analysis</h1>
          <p>
            Submit a loan for your credit panel to analyze. Choose between
            a buy analysis for new loans or a switch analysis to compare
            two loans.
          </p>
        </div>
        <AnalysisForm />
      </div>
    </div>
  );
}
