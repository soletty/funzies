import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { verifyEvaluationAccess } from "@/lib/ic/access";
import type { ParsedEvaluation } from "@/lib/ic/types";
import MemoViewer from "@/components/ic/MemoViewer";

export default async function MemoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) notFound();

  const { id } = await params;

  const hasAccess = await verifyEvaluationAccess(id, session.user.id);
  if (!hasAccess) notFound();

  const rows = await query<{ parsed_data: ParsedEvaluation | null }>(
    "SELECT parsed_data FROM ic_evaluations WHERE id = $1",
    [id]
  );

  if (rows.length === 0) {
    notFound();
  }

  const memo = rows[0].parsed_data?.memo;
  if (!memo) {
    return <p style={{ color: "var(--color-text-muted)" }}>Memo not yet available.</p>;
  }

  return <MemoViewer memo={memo} />;
}
