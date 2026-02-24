import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { verifyEvaluationAccess } from "@/lib/ic/access";
import type { ParsedEvaluation, CommitteeMember } from "@/lib/ic/types";
import DebateViewer from "@/components/ic/DebateViewer";

export default async function DebatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) notFound();

  const { id } = await params;

  const hasAccess = await verifyEvaluationAccess(id, session.user.id);
  if (!hasAccess) notFound();

  const rows = await query<{
    parsed_data: ParsedEvaluation | null;
    committee_id: string;
    dynamic_specialists: CommitteeMember[] | null;
  }>(
    "SELECT parsed_data, committee_id, dynamic_specialists FROM ic_evaluations WHERE id = $1",
    [id]
  );

  if (rows.length === 0) {
    notFound();
  }

  const debate = rows[0].parsed_data?.debate;
  if (!debate?.length) {
    return <p style={{ color: "var(--color-text-muted)" }}>Debate not yet available.</p>;
  }

  const committees = await query<{ members: CommitteeMember[] }>(
    "SELECT members FROM ic_committees WHERE id = $1",
    [rows[0].committee_id]
  );
  const standingMembers = (committees[0]?.members || []) as CommitteeMember[];
  const dynamicSpecialists = (rows[0].dynamic_specialists || []) as CommitteeMember[];
  const members = [...standingMembers, ...dynamicSpecialists];

  return <DebateViewer rounds={debate} members={members} />;
}
