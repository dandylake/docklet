import { z } from "zod/v4";
import { apiRoute } from "@/lib/api/route";
import { AppError } from "@/lib/errors";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { setSetting, isSetupCompleted, ensureJwtSecret } from "@/lib/config";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

const setupSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(32)
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Username can only contain letters, numbers, hyphens, and underscores"
    ),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine(
  (data) => data.password === data.confirmPassword,
  { message: "Passwords do not match" }
);

export const POST = apiRoute({
  auth: "none",
  handler: async ({ request }) => {
    if (isSetupCompleted()) {
      throw new AppError(400, "Setup already completed");
    }

    checkRateLimit(`setup:${getClientIp(request)}`, 3, 60 * 60 * 1000);

    const raw = await request.json().catch(() => undefined);
    const parsed = setupSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { username, password } = parsed.data;

    ensureJwtSecret();

    const passwordHash = await hashPassword(password);
    const now = new Date();

    const inserted = getDb()
      .insert(users)
      .values({
        username,
        passwordHash,
        role: "admin",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    setSetting("app_name", "Docklet");

    const token = await createSession(inserted);
    await setSessionCookie(token);

    return NextResponse.json({
      success: true,
      user: { id: inserted.id, username: inserted.username, role: inserted.role },
    });
  },
});
