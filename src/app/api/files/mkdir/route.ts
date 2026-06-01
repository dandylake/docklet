import { z } from "zod/v4";
import { jsonRoute } from "@/lib/api/route";
import { mkdir } from "@/lib/files/service";

export const runtime = "nodejs";

const schema = z.object({ path: z.string().min(1) });

export const POST = jsonRoute({
  auth: ["admin", "mod"],
  body: schema,
  handler: async ({ body }) => {
    const entry = await mkdir(body.path);
    return { entry };
  },
});
