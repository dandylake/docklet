import { requireAuth, handleApiError } from "@/lib/auth/middleware";
import { containerEventStream } from "@/lib/docker/events";
import { pumpToSSE } from "@/lib/sse/pump";

export async function GET() {
  try {
    await requireAuth();
    return pumpToSSE(containerEventStream(), { heartbeatMs: 30_000 });
  } catch (error) {
    return handleApiError(error);
  }
}
