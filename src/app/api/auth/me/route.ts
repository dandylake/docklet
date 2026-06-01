import { jsonRoute } from "@/lib/api/route";

export const GET = jsonRoute({
  auth: "authed",
  handler: ({ session }) => ({
    user: {
      id: session!.userId,
      username: session!.username,
      role: session!.role,
    },
  }),
});
