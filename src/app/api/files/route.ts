import { z } from "zod/v4";
import { jsonRoute } from "@/lib/api/route";
import {
  listDir,
  readTextFile,
  writeTextFile,
  statPath,
  rename,
  remove,
  MAX_TEXT_FILE_BYTES,
} from "@/lib/files/service";

export const runtime = "nodejs";

const writeSchema = z.object({
  path: z.string(),
  content: z.string().max(MAX_TEXT_FILE_BYTES),
});

const renameSchema = z.object({
  path: z.string(),
  newPath: z.string(),
});

const pathQuery = z.object({
  path: z.string().optional().transform((v) => v ?? ""),
});

export const GET = jsonRoute<Record<string, string>, undefined, z.infer<typeof pathQuery>>({
  auth: "authed",
  query: pathQuery,
  handler: async ({ query }) => {
    const entry = await statPath(query.path);
    if (entry.isDir) {
      const entries = await listDir(query.path);
      return { entry, entries };
    }
    const { content, encoding } = await readTextFile(query.path);
    return { entry, content, encoding };
  },
});

export const POST = jsonRoute({
  auth: ["admin", "mod"],
  body: writeSchema,
  handler: async ({ body }) => {
    const entry = await writeTextFile(body.path, body.content);
    return { entry };
  },
});

export const PATCH = jsonRoute({
  auth: ["admin", "mod"],
  body: renameSchema,
  handler: async ({ body }) => {
    const entry = await rename(body.path, body.newPath);
    return { entry };
  },
});

export const DELETE = jsonRoute<Record<string, string>, undefined, z.infer<typeof pathQuery>>({
  auth: ["admin", "mod"],
  query: pathQuery,
  handler: async ({ query }) => {
    await remove(query.path);
    return { ok: true };
  },
});
