import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { verifyEvaluationAccess } from "@/lib/ic/access";
import type { CommitteeMember } from "@/lib/ic/types";
import FollowUpChat from "@/components/ic/FollowUpChat";

export default async function FollowUpsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) notFound();

  const { id } = await params;

  const hasAccess = await verifyEvaluationAccess(id, session.user.id);
  if (!hasAccess) notFound();

  const rows = await query<{ committee_id: string; dynamic_specialists: CommitteeMember[] }>(
    "SELECT committee_id, dynamic_specialists FROM ic_evaluations WHERE id = $1",
    [id]
  );

  if (rows.length === 0) {
    notFound();
  }

  const committees = await query<{ members: CommitteeMember[] }>(
    "SELECT members FROM ic_committees WHERE id = $1",
    [rows[0].committee_id]
  );
  const standingMembers = (committees[0]?.members || []) as CommitteeMember[];
  const dynamicSpecialists = (rows[0].dynamic_specialists || []) as CommitteeMember[];
  const members = [...standingMembers, ...dynamicSpecialists];

  return <FollowUpChat evaluationId={id} members={members} />;
}
