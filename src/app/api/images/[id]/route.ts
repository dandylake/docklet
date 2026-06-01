import { z } from "zod/v4";
import { jsonRoute } from "@/lib/api/route";
import { removeImage } from "@/lib/docker/images";

export const DELETE = jsonRoute<{ id: string }, undefined, { force: boolean }>({
  auth: "admin",
  query: z.object({
    force: z
      .string()
      .optional()
      .transform((v) => v === "true"),
  }),
  handler: async ({ params, query }) => {
    await removeImage(params.id, query.force);
    return { success: true };
  },
});
