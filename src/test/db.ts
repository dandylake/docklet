import { beforeEach, afterEach } from "vitest";
import { createDbInstance, setDb, resetDb, type Db } from "@/lib/db";
import { ensureJwtSecret } from "@/lib/config";
import { __resetRateLimits } from "@/lib/rate-limit";

export function createTestDb(): Db {
  const db = createDbInstance(":memory:");
  ensureJwtSecret(db);
  return db;
}

export function useTestDb(): { get: () => Db } {
  let db: Db;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
    globalThis.__testCookieJar.clear();
    __resetRateLimits();
  });

  afterEach(() => {
    db.$client.close(); // better-sqlite3 close() is idempotent
    resetDb();
  });

  return {
    get: () => db,
  };
}
