import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";
import { verifyAnalysisAccess } from "@/lib/clo/access";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const hasAccess = await verifyAnalysisAccess(id, user.id);
  if (!hasAccess) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const maxAttempts = 300; // 10 minutes at 2s intervals

      for (let attempts = 0; attempts < maxAttempts; attempts++) {
        const rows = await query<{
          status: string;
          current_phase: string | null;
          raw_files: Record<string, string> | null;
          error_message: string | null;
        }>(
          "SELECT status, current_phase, raw_files, error_message FROM clo_analyses WHERE id = $1",
          [id]
        );

        if (rows.length === 0) {
          send({ status: "error", message: "Analysis not found" });
          controller.close();
          return;
        }

        const { status, current_phase, raw_files, error_message } = rows[0];
        const completedPhases = raw_files
          ? Object.keys(raw_files).map((k) => k.replace(/\.(?:md|json)$/, ""))
          : [];

        send({ status, currentPhase: current_phase, phases: completedPhases });

        if (status === "complete") {
          send({ status: "complete" });
          controller.close();
          return;
        }

        if (status === "error") {
          send({ status: "error", message: error_message || "Analysis failed" });
          controller.close();
          return;
        }

        await new Promise((r) => setTimeout(r, 2000));
      }

      send({ status: "error", message: "Timeout waiting for analysis" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
