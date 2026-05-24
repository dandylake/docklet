import { requireAuth, handleApiError } from "@/lib/auth/middleware";
import { overviewStream } from "@/lib/docker/stats";
import { pumpToSSE } from "@/lib/sse/pump";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TICK_MS = 1500;
const HEARTBEAT_MS = 30_000;

export async function GET() {
  try {
    await requireAuth();
    return pumpToSSE(overviewStream({ intervalMs: TICK_MS }), {
      heartbeatMs: HEARTBEAT_MS,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
