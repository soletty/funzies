import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getCommitteeForUser } from "@/lib/ic/access";
import EvaluationForm from "@/components/ic/EvaluationForm";

export default async function NewEvaluationPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const committee = await getCommitteeForUser(session.user.id);
  if (!committee || committee.status !== "active") {
    redirect("/ic");
  }

  return (
    <div className="ic-content">
      <div className="ic-form-page">
        <div className="standalone-header">
          <h1>New Evaluation</h1>
          <p>
            Submit an investment opportunity for your committee to evaluate.
            They will produce a full memo, risk assessment, debate, and
            recommendation.
          </p>
        </div>
        <EvaluationForm />
      </div>
    </div>
  );
}
