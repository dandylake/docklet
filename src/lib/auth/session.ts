import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getSetting } from "@/lib/config";
import type { User } from "@/lib/db/schema";

export const COOKIE_NAME = "docklet_session";
const EXPIRY_HOURS = 72;

async function getJwtSecret(): Promise<Uint8Array> {
  const secret = getSetting("jwt_secret");
  if (!secret) {
    throw new Error("JWT secret not configured");
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: number;
  username: string;
  role: string;
}

export async function createSession(user: User): Promise<string> {
  const secret = await getJwtSecret();
  const token = await new SignJWT({
    userId: user.id,
    username: user.username,
    role: user.role,
  } satisfies SessionPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${EXPIRY_HOURS}h`)
    .sign(secret);

  return token;
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: EXPIRY_HOURS * 60 * 60,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const secret = await getJwtSecret();
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSessionFromToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const secret = await getJwtSecret();
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
