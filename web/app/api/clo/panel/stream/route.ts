import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await query<{
    id: string;
    status: string;
    raw_files: Record<string, string> | null;
    error_message: string | null;
  }>(
    `SELECT p.id, p.status, p.raw_files, p.error_message
     FROM clo_panels p
     JOIN clo_profiles pr ON p.profile_id = pr.id
     WHERE pr.user_id = $1`,
    [user.id]
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: "No panel found" }, { status: 404 });
  }

  const panelId = rows[0].id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const maxAttempts = 150; // 5 minutes at 2s intervals

      for (let attempts = 0; attempts < maxAttempts; attempts++) {
        const current = await query<{
          status: string;
          raw_files: Record<string, string> | null;
          error_message: string | null;
        }>(
          "SELECT status, raw_files, error_message FROM clo_panels WHERE id = $1",
          [panelId]
        );

        if (current.length === 0) {
          send({ status: "error", message: "Panel not found" });
          controller.close();
          return;
        }

        const { status, raw_files, error_message } = current[0];
        const completedPhases = raw_files
          ? Object.keys(raw_files).map((k) => k.replace(/\.(?:md|json)$/, ""))
          : [];

        send({ status, phases: completedPhases });

        if (status === "active") {
          send({ status: "complete" });
          controller.close();
          return;
        }

        if (status === "error") {
          send({ status: "error", message: error_message || "Generation failed" });
          controller.close();
          return;
        }

        await new Promise((r) => setTimeout(r, 2000));
      }

      send({ status: "error", message: "Timeout waiting for generation" });
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
