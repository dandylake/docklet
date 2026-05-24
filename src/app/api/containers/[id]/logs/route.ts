import { NextRequest } from "next/server";
import { requireAuth, AuthError, handleApiError } from "@/lib/auth/middleware";
import { containerLogLines, isSelfContainer } from "@/lib/docker/containers";
import { pumpToSSE } from "@/lib/sse/pump";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    if (session.role !== "admin" && isSelfContainer(id)) {
      throw new AuthError("Forbidden", 403);
    }
    const tail = parseInt(
      request.nextUrl.searchParams.get("tail") ?? "200",
      10
    );
    return pumpToSSE(containerLogLines(id, { tail }));
  } catch (error) {
    return handleApiError(error);
  }
}
