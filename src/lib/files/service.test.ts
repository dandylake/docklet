import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { rmSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import { fileTypeFromBuffer } from "file-type";
import { useTempDataDir } from "@/test/data-dir";

vi.mock("file-type", () => ({
  fileTypeFromBuffer: vi.fn(async () => undefined),
}));

describe("files/service", () => {
  const dataDir = useTempDataDir();
  let service: typeof import("./service");
  let volumesDir: string;

  beforeAll(async () => {
    service = await import("./service");
    volumesDir = join(dataDir.get(), "volumes");
  });

  beforeEach(() => {
    rmSync(volumesDir, { recursive: true, force: true });
    mkdirSync(volumesDir, { recursive: true });
    vi.mocked(fileTypeFromBuffer).mockReset().mockResolvedValue(undefined);
  });

  describe("listDir", () => {
    it("when a directory has both dirs and files — returns dirs first, each group alpha sorted", async () => {
      mkdirSync(join(volumesDir, "zeta"));
      mkdirSync(join(volumesDir, "alpha"));
      writeFileSync(join(volumesDir, "b.txt"), "b");
      writeFileSync(join(volumesDir, "a.txt"), "a");

      const entries = await service.listDir("");
      expect(entries.map((e) => e.name)).toEqual(["alpha", "zeta", "a.txt", "b.txt"]);
      expect(entries[0].isDir).toBe(true);
      expect(entries[2].isDir).toBe(false);
    });

    it("when the path contains traversal — rejects with 400", async () => {
      await expect(service.listDir("../..")).rejects.toMatchObject({ status: 400 });
    });

    it("when a file has no binary signature — its entry has isText true", async () => {
      writeFileSync(join(volumesDir, "notes.txt"), "hello world");

      const entries = await service.listDir("");
      expect(entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "notes.txt", isText: true }),
        ])
      );
    });

    it("when fileTypeFromBuffer detects a binary mime — its entry has isText false", async () => {
      vi.mocked(fileTypeFromBuffer).mockResolvedValue({ mime: "image/png", ext: "png" });
      writeFileSync(join(volumesDir, "img.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

      const entries = await service.listDir("");
      expect(entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "img.png", isText: false }),
        ])
      );
    });

    it("when an entry is a directory — isText is false regardless of content", async () => {
      mkdirSync(join(volumesDir, "subdir"));

      const entries = await service.listDir("");
      expect(entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "subdir", isDir: true, isText: false }),
        ])
      );
    });

    it("when a file is empty — its entry has isText true", async () => {
      writeFileSync(join(volumesDir, "empty.txt"), "");

      const entries = await service.listDir("");
      expect(entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "empty.txt", isText: true }),
        ])
      );
    });
  });

  describe("writeTextFile + readTextFile", () => {
    it("round-trips content and reports the encoding", async () => {
      await service.writeTextFile("hello.txt", "world\n");
      const { content, encoding } = await service.readTextFile("hello.txt");
      expect(content).toBe("world\n");
      expect(encoding).toBe("utf-8");
    });

    it("writeTextFile creates intermediate directories", async () => {
      await service.writeTextFile("a/b/c.txt", "nested");
      const buf = await readFile(join(volumesDir, "a", "b", "c.txt"), "utf-8");
      expect(buf).toBe("nested");
    });

    it("when readTextFile hits a binary mime type — rejects with 415", async () => {
      vi.mocked(fileTypeFromBuffer).mockResolvedValue({ mime: "image/png", ext: "png" });
      writeFileSync(join(volumesDir, "img.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      await expect(service.readTextFile("img.png")).rejects.toMatchObject({ status: 415 });
    });

    it("when readTextFile hits an explicit text mime type — returns the content", async () => {
      vi.mocked(fileTypeFromBuffer).mockResolvedValue({ mime: "application/json", ext: "json" });
      writeFileSync(join(volumesDir, "data.json"), '{"ok":true}');
      const { content } = await service.readTextFile("data.json");
      expect(content).toBe('{"ok":true}');
    });

    it("when readTextFile targets a missing file — rejects with 404", async () => {
      await expect(service.readTextFile("ghost.txt")).rejects.toMatchObject({ status: 404 });
    });

    it("when readTextFile targets a file over the byte limit — rejects with 413", async () => {
      writeFileSync(join(volumesDir, "big.txt"), "x".repeat(1000));
      await expect(service.readTextFile("big.txt", 100)).rejects.toMatchObject({ status: 413 });
    });
  });

  describe("mkdir", () => {
    it("creates the directory and returns a dir entry", async () => {
      const entry = await service.mkdir("new-dir");
      expect(entry.isDir).toBe(true);
      expect(existsSync(join(volumesDir, "new-dir"))).toBe(true);
    });
  });

  describe("rename", () => {
    it("moves a file to the new path", async () => {
      writeFileSync(join(volumesDir, "old.txt"), "data");
      const entry = await service.rename("old.txt", "sub/new.txt");
      expect(entry.path).toBe("sub/new.txt");
      expect(existsSync(join(volumesDir, "old.txt"))).toBe(false);
      expect(existsSync(join(volumesDir, "sub", "new.txt"))).toBe(true);
    });
  });

  describe("remove", () => {
    it("recursively deletes a directory", async () => {
      mkdirSync(join(volumesDir, "trash", "inner"), { recursive: true });
      writeFileSync(join(volumesDir, "trash", "inner", "a"), "a");
      await service.remove("trash");
      expect(existsSync(join(volumesDir, "trash"))).toBe(false);
    });

    it("when the path is an empty string — rejects with 400", async () => {
      await expect(service.remove("")).rejects.toMatchObject({ status: 400 });
    });

    it("when the path is a dot — rejects with 400", async () => {
      await expect(service.remove(".")).rejects.toMatchObject({ status: 400 });
    });
  });

  describe("saveUploadStream", () => {
    it("when the stream exceeds the byte limit — rejects with 413 and removes the partial file", async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(100));
          controller.enqueue(new Uint8Array(100));
          controller.close();
        },
      });
      await expect(
        service.saveUploadStream("", "upload.bin", body, 150)
      ).rejects.toMatchObject({ status: 413 });
      expect(existsSync(join(volumesDir, "upload.bin"))).toBe(false);
    });

    it("when the stream is within the limit — writes the file with the correct size", async () => {
      const payload = new Uint8Array(50).fill(0x41);
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(payload);
          controller.close();
        },
      });
      const entry = await service.saveUploadStream("", "ok.txt", body, 1024);
      expect(entry.size).toBe(50);
      expect(existsSync(join(volumesDir, "ok.txt"))).toBe(true);
    });

    it("when the filename contains path traversal — rejects with 400", async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([0x41]));
          controller.close();
        },
      });
      await expect(
        service.saveUploadStream("", "../evil.txt", body)
      ).rejects.toMatchObject({ status: 400 });
    });
  });
});
