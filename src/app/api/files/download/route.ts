import { Readable } from "stream";
import { binaryRoute } from "@/lib/api/route";
import { createDownloadStream } from "@/lib/files/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = binaryRoute({
  auth: "authed",
  handler: async ({ request }) => {
    const relPath = request.nextUrl.searchParams.get("path") ?? "";
    const { stream, size, filename } = await createDownloadStream(relPath);

    const webStream = Readable.toWeb(stream as Readable) as unknown as ReadableStream<Uint8Array>;

    return {
      body: webStream,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(size),
        "Content-Disposition": `attachment; filename="${encodeFilename(filename)}"`,
        "Cache-Control": "no-store",
      },
    };
  },
});

function encodeFilename(name: string): string {
  return name.replace(/["\r\n]/g, "_");
}
