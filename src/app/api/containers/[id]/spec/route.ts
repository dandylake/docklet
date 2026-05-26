import { NextRequest, NextResponse } from "next/server";
import { requireSelfContainerAccess, handleApiError } from "@/lib/auth/middleware";
import { inspectContainer, containerDetailToCreateInput } from "@/lib/docker/containers";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await requireSelfContainerAccess(id);
    const detail = await inspectContainer(id);
    return NextResponse.json(containerDetailToCreateInput(detail));
  } catch (error) {
    return handleApiError(error);
  }
}
