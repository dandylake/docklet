import { requireSelfContainerAccess, handleApiError } from "@/lib/auth/middleware";
import { inspectContainer } from "@/lib/docker/containers";
import { containerStatsFrames } from "@/lib/docker/stats";
import { pumpToSSE } from "@/lib/sse/pump";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await requireSelfContainerAccess(id);
    const detail = await inspectContainer(id);
    return pumpToSSE(
      containerStatsFrames(id, { name: detail.name, state: detail.state }),
      { heartbeatMs: 30_000 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
