import { describe, it, expect, beforeAll } from "vitest";
import { existsSync } from "fs";
import { join } from "path";
import { useTempDataDir } from "@/test/data-dir";

describe("initDataDirs", () => {
  const dataDir = useTempDataDir();
  let initDataDirs: typeof import("./index").initDataDirs;

  beforeAll(async () => {
    ({ initDataDirs } = await import("./index"));
  });

  it("creates the db, certs, and backups subdirectories", () => {
    initDataDirs();
    for (const sub of ["db", "certs", "backups"]) {
      expect(existsSync(join(dataDir.get(), sub))).toBe(true);
    }
  });

  it("when called again on an existing data dir — is idempotent and does not throw", () => {
    initDataDirs();
    expect(() => initDataDirs()).not.toThrow();
  });
});
