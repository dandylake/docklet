import { z } from "zod/v4";
import { jsonRoute } from "@/lib/api/route";
import { listUsers, createUser } from "@/lib/users/service";

export const runtime = "nodejs";

const createSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, "Username must be alphanumeric, dash, or underscore"),
  password: z.string().min(8),
  role: z.enum(["admin", "mod", "user"]),
});

export const GET = jsonRoute({
  auth: "admin",
  handler: () => listUsers(),
});

export const POST = jsonRoute({
  auth: "admin",
  body: createSchema,
  status: 201,
  handler: ({ body }) => createUser(body),
});
