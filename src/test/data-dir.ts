import { beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/**
 * Provides an isolated temporary DOCKLET_DATA_DIR for the calling test file.
 *
 * Uses beforeAll/afterAll rather than per-test hooks on purpose: db/index.ts
 * freezes DATA_DIR at module load, so the directory cannot change once the
 * module graph is loaded. Per-test isolation is the caller's responsibility
 * (reset the relevant subdirectory in a beforeEach).
 *
 * Call this at the top of a describe block so its beforeAll registers before
 * the test file imports any module that reads DOCKLET_DATA_DIR.
 */
export function useTempDataDir(): { get: () => string } {
  let dir: string;
  let prev: string | undefined;

  beforeAll(() => {
    prev = process.env.DOCKLET_DATA_DIR;
    dir = mkdtempSync(join(tmpdir(), "docklet-test-"));
    process.env.DOCKLET_DATA_DIR = dir;
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    if (prev === undefined) {
      delete process.env.DOCKLET_DATA_DIR;
    } else {
      process.env.DOCKLET_DATA_DIR = prev;
    }
  });

  return { get: () => dir };
}
