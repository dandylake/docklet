import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import { apiRoute } from "@/lib/api/route";
import { AppError } from "@/lib/errors";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const POST = apiRoute({
  auth: "none",
  handler: async ({ request }) => {
    if (!process.env.E2E_DISABLE_RATE_LIMIT) {
      checkRateLimit(`login:${getClientIp(request)}`, 5, 15 * 60 * 1000);
    }

    const raw = await request.json().catch(() => undefined);
    const parsed = loginSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { username, password } = parsed.data;

    const user = getDb()
      .select()
      .from(users)
      .where(eq(users.username, username))
      .get();

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new AppError(401, "Invalid username or password");
    }

    const token = await createSession(user);
    await setSessionCookie(token);

    return NextResponse.json({
      user: { id: user.id, username: user.username, role: user.role },
    });
  },
});
