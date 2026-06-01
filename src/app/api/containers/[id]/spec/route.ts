import { jsonRoute } from "@/lib/api/route";
import { requireSelfContainerAccess } from "@/lib/auth/middleware";
import {
  inspectContainer,
  containerDetailToCreateInput,
} from "@/lib/docker/containers";

export const GET = jsonRoute<{ id: string }>({
  auth: ({ params }) => requireSelfContainerAccess(params.id),
  handler: async ({ params }) => {
    const detail = await inspectContainer(params.id);
    return containerDetailToCreateInput(detail);
  },
});
