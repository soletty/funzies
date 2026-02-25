import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";
import { getAssemblyAccess } from "@/lib/assembly-access";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const userId = user.id;

  const access = await getAssemblyAccess(id, userId);
  if (!access) {
    return new Response("Not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  let lastPhase = "";
  let lastStatus = "";

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const rows = await query(
        "SELECT status, current_phase, slug FROM assemblies WHERE id = $1",
        [id]
      );
      if (!rows.length) {
        sendEvent({ type: "error", content: "Assembly not found" });
        controller.close();
        return;
      }

      const initial = rows[0];
      lastPhase = (initial.current_phase as string) || "";
      lastStatus = initial.status as string;

      sendEvent({
        type: "state",
        status: initial.status,
        currentPhase: initial.current_phase,
        slug: initial.slug,
      });

      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(interval);
        controller.close();
      };

      const interval = setInterval(async () => {
        if (closed) return;
        try {
          const rows = await query(
            "SELECT status, current_phase, slug FROM assemblies WHERE id = $1",
            [id]
          );
          if (!rows.length) {
            close();
            return;
          }

          const row = rows[0];

          if (row.current_phase !== lastPhase) {
            lastPhase = row.current_phase as string;
            sendEvent({ type: "phase", phase: row.current_phase });
          }

          if (row.status !== lastStatus) {
            lastStatus = row.status as string;
            sendEvent({
              type: "status",
              status: row.status,
              slug: row.slug,
            });

            if (row.status === "complete" || row.status === "error" || row.status === "cancelled") {
              close();
            }
          }
        } catch {
          close();
        }
      }, 3000);

      request.signal.addEventListener("abort", () => {
        close();
      });
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
