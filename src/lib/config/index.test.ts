import { describe, it, expect, onTestFinished } from "vitest";
import { createDbInstance } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { useTestDb } from "@/test/db";
import {
  getSetting,
  setSetting,
  getAllSettings,
  isSetupCompleted,
  ensureJwtSecret,
} from "./index";

describe("config", () => {
  const ctx = useTestDb();

  describe("getSetting", () => {
    it("when the key does not exist — returns null", () => {
      expect(getSetting("missing", ctx.get())).toBeNull();
    });

    it("when the key exists — returns its stored value", () => {
      setSetting("app_name", "Docklet", ctx.get());
      expect(getSetting("app_name", ctx.get())).toBe("Docklet");
    });
  });

  describe("setSetting", () => {
    it("when setting a new key — the value becomes retrievable", () => {
      setSetting("theme", "dark", ctx.get());
      expect(getSetting("theme", ctx.get())).toBe("dark");
    });

    it("when overwriting an existing key — stores the latest value", () => {
      setSetting("theme", "dark", ctx.get());
      setSetting("theme", "light", ctx.get());
      expect(getSetting("theme", ctx.get())).toBe("light");
    });
  });

  describe("getAllSettings", () => {
    it("returns every stored key as a key/value map", () => {
      setSetting("app_name", "Docklet", ctx.get());
      setSetting("theme", "dark", ctx.get());
      expect(getAllSettings(ctx.get())).toMatchObject({
        app_name: "Docklet",
        theme: "dark",
      });
    });
  });

  describe("isSetupCompleted", () => {
    it("when no users exist — returns false", () => {
      expect(isSetupCompleted(ctx.get())).toBe(false);
    });

    it("when only a non-admin user exists — returns false", () => {
      const now = new Date();
      ctx
        .get()
        .insert(users)
        .values({
          username: "bob",
          passwordHash: "hash",
          role: "user",
          createdAt: now,
          updatedAt: now,
        })
        .run();
      expect(isSetupCompleted(ctx.get())).toBe(false);
    });

    it("when an admin user exists — returns true", () => {
      const now = new Date();
      ctx
        .get()
        .insert(users)
        .values({
          username: "admin",
          passwordHash: "hash",
          role: "admin",
          createdAt: now,
          updatedAt: now,
        })
        .run();
      expect(isSetupCompleted(ctx.get())).toBe(true);
    });
  });

  describe("ensureJwtSecret", () => {
    // These tests need a DB without a seeded secret, so they build a raw
    // in-memory instance rather than the secret-seeded createTestDb(). The
    // connection is closed when the test finishes so it does not leak.
    function rawDb() {
      const db = createDbInstance(":memory:");
      onTestFinished(() => {
        db.$client.close();
      });
      return db;
    }

    it("when no secret exists — generates a secret longer than 32 characters", () => {
      const db = rawDb();
      ensureJwtSecret(db);
      const secret = getSetting("jwt_secret", db);
      expect(secret).not.toBeNull();
      expect(secret!.length).toBeGreaterThan(32);
    });

    it("when a secret already exists — leaves it unchanged", () => {
      const db = rawDb();
      setSetting("jwt_secret", "preexisting-secret", db);
      ensureJwtSecret(db);
      expect(getSetting("jwt_secret", db)).toBe("preexisting-secret");
    });
  });
});
