import { requireSelfContainerAccess, handleApiError } from "@/lib/auth/middleware";
import { streamContainerStats, normalizeStats, type RawStats } from "@/lib/docker/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 30_000;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await requireSelfContainerAccess(id);

    const dockerStream = await streamContainerStats(id);
    let aborted = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let buffer = "";

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();

        heartbeat = setInterval(() => {
          if (aborted) return;
          try {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          } catch {
            // Controller closed
          }
        }, HEARTBEAT_MS);

        dockerStream.on("data", (chunk: Buffer) => {
          if (aborted) return;
          buffer += chunk.toString("utf-8");
          let nl: number;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            if (!line.trim()) continue;
            try {
              const raw = JSON.parse(line) as RawStats;
              const stats = normalizeStats(raw, {
                id,
                name: "",
                state: "running",
              });
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(stats)}\n\n`)
              );
            } catch {
              // Skip malformed frame
            }
          }
        });

        dockerStream.on("end", () => {
          if (heartbeat) clearInterval(heartbeat);
          if (!aborted) controller.close();
        });

        dockerStream.on("error", () => {
          if (heartbeat) clearInterval(heartbeat);
          if (!aborted) controller.close();
        });
      },
      cancel() {
        aborted = true;
        if (heartbeat) clearInterval(heartbeat);
        if ("destroy" in dockerStream) {
          (
            dockerStream as NodeJS.ReadableStream & { destroy: () => void }
          ).destroy();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
