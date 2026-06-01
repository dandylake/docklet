import { z } from "zod/v4";
import { jsonRoute } from "@/lib/api/route";
import { execInContainer } from "@/lib/docker/containers";

const execSchema = z.object({
  cmd: z.array(z.string().min(1)).min(1),
});

export const POST = jsonRoute<{ id: string }, z.infer<typeof execSchema>>({
  auth: "admin",
  body: execSchema,
  handler: ({ params, body }) => execInContainer(params.id, body.cmd),
});
