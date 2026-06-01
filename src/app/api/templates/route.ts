import { z } from "zod/v4";
import { jsonRoute } from "@/lib/api/route";
import { getDb } from "@/lib/db";
import { containerTemplates } from "@/lib/db/schema";

const createTemplateSchema = z.object({
  name: z.string().min(1),
  config: z.object({}).passthrough(),
});

export const GET = jsonRoute({
  auth: "authed",
  handler: () => getDb().select().from(containerTemplates).all(),
});

export const POST = jsonRoute({
  auth: "authed",
  body: createTemplateSchema,
  status: 201,
  handler: ({ body, session }) =>
    getDb()
      .insert(containerTemplates)
      .values({
        name: body.name,
        config: JSON.stringify(body.config),
        createdBy: session!.userId,
      })
      .returning()
      .get(),
});
