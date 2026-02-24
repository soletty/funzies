import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getProfileForUser, getPanelForUser } from "@/lib/clo/access";
import type { PanelMember } from "@/lib/clo/types";
import PanelView from "@/components/clo/PanelView";

export default async function PanelPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  const profile = await getProfileForUser(session.user.id);
  if (!profile) {
    redirect("/clo/onboarding");
  }

  const panel = await getPanelForUser(session.user.id);

  if (!panel) {
    redirect("/clo/onboarding");
  }

  if (panel.status === "queued" || panel.status === "generating") {
    redirect("/clo/panel/generating");
  }

  if (panel.status === "error") {
    return (
      <div className="ic-content">
        <div className="ic-empty-state">
          <h1>Panel Error</h1>
          <p>{panel.error_message || "There was an issue generating your panel."}</p>
        </div>
      </div>
    );
  }

  const members = (panel.members || []) as PanelMember[];

  return (
    <div className="ic-content">
      <PanelView members={members} />
    </div>
  );
}
