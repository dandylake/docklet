import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api/route";
import { AppError } from "@/lib/errors";
import { saveUploadStream, MAX_UPLOAD_BYTES } from "@/lib/files/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiRoute({
  auth: ["admin", "mod"],
  handler: async ({ request }) => {
    const relDir = request.nextUrl.searchParams.get("path") ?? "";
    const filename = request.headers.get("x-filename");
    if (!filename) {
      throw new AppError(400, "Missing X-Filename header");
    }

    const contentLength = request.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_UPLOAD_BYTES) {
      throw new AppError(413, `Upload exceeds max size (${MAX_UPLOAD_BYTES} bytes)`);
    }

    const entry = await saveUploadStream(relDir, filename, request.body);
    return NextResponse.json({ entry });
  },
});
