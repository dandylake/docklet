import { jsonRoute } from "@/lib/api/route";
import { clearSessionCookie } from "@/lib/auth/session";

export const POST = jsonRoute({
  auth: "none",
  handler: async () => {
    await clearSessionCookie();
    return { success: true };
  },
});
