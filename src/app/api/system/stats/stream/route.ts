import { requireAuth, handleApiError } from "@/lib/auth/middleware";
import { systemStatsStream } from "@/lib/system/stats";
import { pumpToSSE } from "@/lib/sse/pump";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TICK_MS = 2000;
const HEARTBEAT_MS = 30_000;

export async function GET() {
  try {
    await requireAuth();
    return pumpToSSE(systemStatsStream({ intervalMs: TICK_MS }), {
      heartbeatMs: HEARTBEAT_MS,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
