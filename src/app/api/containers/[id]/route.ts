import { NextRequest, NextResponse } from "next/server";
import { requireSelfContainerAccess, handleApiError } from "@/lib/auth/middleware";
import { inspectContainer, removeContainer } from "@/lib/docker/containers";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await requireSelfContainerAccess(id);
    const container = await inspectContainer(id);
    return NextResponse.json(container);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await requireSelfContainerAccess(id);
    const force = request.nextUrl.searchParams.get("force") === "true";
    await removeContainer(id, force);
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
