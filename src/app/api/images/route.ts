import { jsonRoute } from "@/lib/api/route";
import { listImages } from "@/lib/docker/images";

export const GET = jsonRoute({
  auth: "authed",
  handler: () => listImages(),
});
