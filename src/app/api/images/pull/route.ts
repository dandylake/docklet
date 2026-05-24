import { NextRequest, NextResponse } from "next/server";
import { requireRole, handleApiError } from "@/lib/auth/middleware";
import { pullImageLines } from "@/lib/docker/images";
import { pumpToSSE } from "@/lib/sse/pump";

export async function POST(request: NextRequest) {
  try {
    await requireRole("admin");
    const body = await request.json();
    const image = body.image;
    if (!image || typeof image !== "string") {
      return NextResponse.json({ error: "image is required" }, { status: 400 });
    }
    return pumpToSSE(pullImageLines(image));
  } catch (error) {
    return handleApiError(error);
  }
}
