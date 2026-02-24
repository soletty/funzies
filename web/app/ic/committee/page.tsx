import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getProfileForUser, getCommitteeForUser } from "@/lib/ic/access";
import type { CommitteeMember } from "@/lib/ic/types";
import CommitteePanel from "@/components/ic/CommitteePanel";

export default async function CommitteePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  const profile = await getProfileForUser(session.user.id);
  if (!profile) {
    redirect("/ic/onboarding");
  }

  const committee = await getCommitteeForUser(session.user.id);

  if (!committee) {
    redirect("/ic/onboarding");
  }

  if (committee.status === "queued" || committee.status === "generating") {
    redirect("/ic/committee/generating");
  }

  if (committee.status === "error") {
    return (
      <div className="ic-content">
        <div className="ic-empty-state">
          <h1>Committee Error</h1>
          <p>{committee.error_message || "There was an issue generating your committee."}</p>
        </div>
      </div>
    );
  }

  const members = (committee.members || []) as CommitteeMember[];

  return (
    <div className="ic-content">
      <CommitteePanel members={members} />
    </div>
  );
}
