import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getProfileForUser, getPanelForUser } from "@/lib/clo/access";
import QuestionnaireForm from "@/components/clo/QuestionnaireForm";

export default async function CLOOnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  const profile = await getProfileForUser(session.user.id);
  if (profile) {
    const panel = await getPanelForUser(session.user.id);
    if (panel && panel.status === "active") {
      redirect("/clo");
    }
    if (panel && (panel.status === "generating" || panel.status === "queued")) {
      redirect("/clo/panel/generating");
    }
    // panel.status === "error": let the user re-submit the form.
    // The panel POST route uses ON CONFLICT so re-submission resets to queued.
  }

  return (
    <div className="ic-onboarding">
      <div className="ic-onboarding-inner">
        <div className="ic-onboarding-header">
          <h1>Build Your Credit Panel</h1>
          <p>
            Answer a few questions about your CLO strategy. We will use
            your responses to assemble a bespoke panel of credit specialists.
          </p>
        </div>
        <QuestionnaireForm />
      </div>
    </div>
  );
}
