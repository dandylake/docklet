import { NextResponse } from "next/server";
import { getSession, type SessionPayload } from "./session";
import { isSelfContainer } from "@/lib/docker/containers";
import { AppError } from "@/lib/errors";

export async function requireAuth(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new AuthError("Unauthorized", 401);
  }
  return session;
}

export async function requireRole(
  ...roles: string[]
): Promise<SessionPayload> {
  const session = await requireAuth();
  if (!roles.includes(session.role)) {
    throw new AuthError("Forbidden", 403);
  }
  return session;
}

/** Require a session and enforce the self-container access policy: only
 *  admins may read or mutate the container that Docklet itself runs in.
 *  Non-self container IDs pass through unchanged. Returns the session so
 *  callers that need `session.role` or `session.userId` can keep using it. */
export async function requireSelfContainerAccess(
  id: string,
): Promise<SessionPayload> {
  const session = await requireAuth();
  if (session.role !== "admin" && isSelfContainer(id)) {
    throw new AuthError("Forbidden", 403);
  }
  return session;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }
  console.error("API error:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
