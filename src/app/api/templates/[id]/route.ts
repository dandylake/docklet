import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import { jsonRoute } from "@/lib/api/route";
import { getDb } from "@/lib/db";
import { containerTemplates } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  config: z.object({}).passthrough().optional(),
});

function templateId(raw: string): number {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) {
    throw new AppError(400, "Invalid template id");
  }
  return n;
}

export const GET = jsonRoute<{ id: string }>({
  auth: "authed",
  handler: ({ params }) => {
    const template = getDb()
      .select()
      .from(containerTemplates)
      .where(eq(containerTemplates.id, templateId(params.id)))
      .get();
    if (!template) throw new AppError(404, "Template not found");
    return template;
  },
});

export const PUT = jsonRoute<{ id: string }, z.infer<typeof updateTemplateSchema>>({
  auth: "authed",
  body: updateTemplateSchema,
  handler: ({ params, body }) => {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name) updates.name = body.name;
    if (body.config) updates.config = JSON.stringify(body.config);

    const template = getDb()
      .update(containerTemplates)
      .set(updates)
      .where(eq(containerTemplates.id, templateId(params.id)))
      .returning()
      .get();
    if (!template) throw new AppError(404, "Template not found");
    return template;
  },
});

export const DELETE = jsonRoute<{ id: string }>({
  auth: "authed",
  handler: ({ params }) => {
    getDb()
      .delete(containerTemplates)
      .where(eq(containerTemplates.id, templateId(params.id)))
      .run();
    return { success: true };
  },
});
