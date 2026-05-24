import { NextRequest, NextResponse } from "next/server";
import { requireSelfContainerAccess, handleApiError } from "@/lib/auth/middleware";
import { restartContainer } from "@/lib/docker/containers";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await requireSelfContainerAccess(id);
    await restartContainer(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
