import { jsonRoute } from "@/lib/api/route";

export const POST = jsonRoute({
  auth: "admin",
  handler: async () => {
    // Give the response time to flush before the process exits.
    // Docker's restart policy will bring the container back up.
    setTimeout(() => process.exit(0), 500);
    return { success: true, message: "Restarting..." };
  },
});
