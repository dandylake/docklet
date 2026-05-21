import { createUser, type Role } from "@/lib/users/service";
import { createSession, COOKIE_NAME } from "@/lib/auth/session";
import { eq } from "drizzle-orm";
import { users } from "@/lib/db/schema";
import type { Db } from "@/lib/db";
import { username, password } from "./faker";

export interface TestUser {
  id: number;
  username: string;
  role: Role;
  password: string;
}

export async function createTestUser(
  db: Db,
  opts: { role?: Role; password?: string } = {}
): Promise<TestUser> {
  const name = username();
  const pw = opts.password ?? password();
  const dto = await createUser(
    { username: name, password: pw, role: opts.role ?? "user" },
    db
  );
  return { id: dto.id, username: dto.username, role: dto.role, password: pw };
}

export async function loginAs(
  db: Db,
  opts: { role?: Role } = {}
): Promise<TestUser> {
  const user = await createTestUser(db, opts);
  await setSessionCookieFor(db, user.id);
  return user;
}

export async function setSessionCookieFor(db: Db, userId: number): Promise<void> {
  const row = db.select().from(users).where(eq(users.id, userId)).get();
  if (!row) throw new Error(`User ${userId} not found`);
  const token = await createSession(row);
  globalThis.__testCookieJar.set(COOKIE_NAME, token);
}

export function clearSession(): void {
  globalThis.__testCookieJar.delete(COOKIE_NAME);
}
