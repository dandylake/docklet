import { jsonRoute } from "@/lib/api/route";
import { requireSelfContainerAccess } from "@/lib/auth/middleware";
import { restartContainer } from "@/lib/docker/containers";

export const POST = jsonRoute<{ id: string }>({
  auth: ({ params }) => requireSelfContainerAccess(params.id),
  handler: async ({ params }) => {
    await restartContainer(params.id);
    return { success: true };
  },
});
