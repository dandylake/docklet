import { jsonRoute } from "@/lib/api/route";
import { requireSelfContainerAccess } from "@/lib/auth/middleware";
import { stopContainer } from "@/lib/docker/containers";

export const POST = jsonRoute<{ id: string }>({
  auth: ({ params }) => requireSelfContainerAccess(params.id),
  handler: async ({ params }) => {
    await stopContainer(params.id);
    return { success: true };
  },
});
