import { z } from "zod/v4";
import { jsonRoute } from "@/lib/api/route";
import { updateUser, deleteUser } from "@/lib/users/service";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    role: z.enum(["admin", "mod", "user"]).optional(),
    password: z.string().min(8).optional(),
  })
  .refine(
    (data) => data.role !== undefined || data.password !== undefined,
    { message: "At least one field (role or password) is required" }
  );

function parseId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new AppError(400, "Invalid user id");
  }
  return n;
}

export const PATCH = jsonRoute<{ id: string }, z.infer<typeof patchSchema>>({
  auth: "admin",
  body: patchSchema,
  handler: ({ params, body }) => updateUser(parseId(params.id), body),
});

export const DELETE = jsonRoute<{ id: string }>({
  auth: "admin",
  handler: async ({ params, session }) => {
    await deleteUser(parseId(params.id), session!.userId);
    return { ok: true };
  },
});
