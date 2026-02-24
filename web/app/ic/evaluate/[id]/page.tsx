import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { verifyEvaluationAccess } from "@/lib/ic/access";

export default async function EvaluationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const { id } = await params;

  const hasAccess = await verifyEvaluationAccess(id, session.user.id);
  if (!hasAccess) redirect("/ic");

  const rows = await query<{ status: string }>(
    "SELECT status FROM ic_evaluations WHERE id = $1",
    [id]
  );

  if (rows.length === 0) {
    redirect("/ic");
  }

  if (rows[0].status === "complete") {
    redirect(`/ic/evaluate/${id}/memo`);
  }

  redirect(`/ic/evaluate/${id}/generating`);
}
