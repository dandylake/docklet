import { jsonRoute } from "@/lib/api/route";
import { getSetting } from "@/lib/config";

export const GET = jsonRoute({
  auth: "none",
  handler: () => ({ app_name: getSetting("app_name") ?? "Docklet" }),
});
