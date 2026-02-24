import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getProfileForUser, getCommitteeForUser } from "@/lib/ic/access";
import QuestionnaireForm from "@/components/ic/QuestionnaireForm";

export default async function ICOnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  const profile = await getProfileForUser(session.user.id);
  if (profile) {
    // Only redirect away if committee exists and is active
    const committee = await getCommitteeForUser(session.user.id);
    if (committee && committee.status === "active") {
      redirect("/ic");
    }
    if (committee && (committee.status === "generating" || committee.status === "queued")) {
      redirect("/ic/committee/generating");
    }
    // If profile exists but no committee (or committee errored), allow re-onboarding
  }

  return (
    <div className="ic-onboarding">
      <div className="ic-onboarding-inner">
        <div className="ic-onboarding-header">
          <h1>Build Your Committee</h1>
          <p>
            Answer a few questions about your investment profile. We will use
            your responses to assemble a bespoke committee of AI specialists.
          </p>
        </div>
        <QuestionnaireForm />
      </div>
    </div>
  );
}
