import { NextRequest } from "next/server";
import { requireSelfContainerAccess, handleApiError } from "@/lib/auth/middleware";
import { containerLogLines } from "@/lib/docker/containers";
import { pumpToSSE } from "@/lib/sse/pump";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await requireSelfContainerAccess(id);
    const tail = parseInt(
      request.nextUrl.searchParams.get("tail") ?? "200",
      10
    );
    return pumpToSSE(containerLogLines(id, { tail }));
  } catch (error) {
    return handleApiError(error);
  }
}
