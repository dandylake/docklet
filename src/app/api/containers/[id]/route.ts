import { z } from "zod/v4";
import { jsonRoute } from "@/lib/api/route";
import { requireSelfContainerAccess } from "@/lib/auth/middleware";
import { inspectContainer, removeContainer } from "@/lib/docker/containers";

export const GET = jsonRoute<{ id: string }>({
  auth: ({ params }) => requireSelfContainerAccess(params.id),
  handler: ({ params }) => inspectContainer(params.id),
});

export const DELETE = jsonRoute<{ id: string }, undefined, { force: boolean }>({
  auth: ({ params }) => requireSelfContainerAccess(params.id),
  query: z.object({
    force: z
      .string()
      .optional()
      .transform((v) => v === "true"),
  }),
  handler: async ({ params, query }) => {
    await removeContainer(params.id, query.force);
    return { success: true };
  },
});
