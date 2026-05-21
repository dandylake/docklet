import { describe, it, expect, beforeAll } from "vitest";
import { join, sep } from "path";
import { useTempDataDir } from "@/test/data-dir";

describe("files/paths", () => {
  const dataDir = useTempDataDir();
  let paths: typeof import("./paths");

  beforeAll(async () => {
    paths = await import("./paths");
  });

  describe("getFilesRoot", () => {
    it("returns the volumes subdirectory of the data dir", () => {
      expect(paths.getFilesRoot()).toBe(join(dataDir.get(), "volumes"));
    });
  });

  describe("resolveSafePath", () => {
    it("when the path is empty or a dot — resolves to the root", () => {
      const root = paths.getFilesRoot();
      expect(paths.resolveSafePath("")).toBe(root);
      expect(paths.resolveSafePath(".")).toBe(root);
    });

    it("when the path is nested — resolves relative to the root", () => {
      const root = paths.getFilesRoot();
      expect(paths.resolveSafePath("sub/dir")).toBe(join(root, "sub", "dir"));
      expect(paths.resolveSafePath("sub/dir/file.txt")).toBe(
        join(root, "sub", "dir", "file.txt")
      );
    });

    it("when the path has leading slashes — strips them before resolving", () => {
      const root = paths.getFilesRoot();
      expect(paths.resolveSafePath("/sub")).toBe(join(root, "sub"));
      expect(paths.resolveSafePath("//sub")).toBe(join(root, "sub"));
    });

    it("when the path contains traversal segments — throws Invalid path", () => {
      expect(() => paths.resolveSafePath("../etc/passwd")).toThrow(/Invalid path/);
      expect(() => paths.resolveSafePath("../../etc/passwd")).toThrow(/Invalid path/);
      expect(() => paths.resolveSafePath("sub/../../etc")).toThrow(/Invalid path/);
      expect(() => paths.resolveSafePath("foo/../../../bar")).toThrow(/Invalid path/);
    });
  });

  describe("toRelative", () => {
    it("returns a forward-slash relative path from the root", () => {
      const root = paths.getFilesRoot();
      expect(paths.toRelative(root)).toBe("");
      expect(paths.toRelative(root + sep + "foo")).toBe("foo");
      expect(paths.toRelative(root + sep + "a" + sep + "b.txt")).toBe("a/b.txt");
    });

    it("when the path is not under the root — throws", () => {
      expect(() => paths.toRelative("/somewhere/else")).toThrow();
    });
  });
});
