import { z } from "zod/v4";
import { jsonRoute } from "@/lib/api/route";
import { requireSelfContainerAccess } from "@/lib/auth/middleware";
import { recreateContainer } from "@/lib/docker/containers";

const updateContainerSchema = z.object({
  name: z.string().min(1),
  image: z.string().min(1),
  ports: z
    .array(
      z.object({
        containerPort: z.number().int().positive(),
        hostPort: z.number().int().positive().optional(),
        protocol: z.enum(["tcp", "udp"]).default("tcp"),
        hostIp: z.string().optional(),
      })
    )
    .optional(),
  env: z.array(z.string()).optional(),
  volumes: z
    .array(
      z.object({
        containerPath: z.string().min(1).startsWith("/"),
        mode: z.enum(["rw", "ro"]).default("rw"),
      })
    )
    .optional(),
  restartPolicy: z
    .object({
      name: z.string(),
      maximumRetryCount: z.number().int().optional(),
    })
    .optional(),
  networkMode: z.string().optional(),
  hostname: z.string().optional(),
  cmd: z.array(z.string()).optional(),
  labels: z.record(z.string(), z.string()).optional(),
  resources: z
    .object({
      cpuLimit: z.number().positive().optional(),
      memoryLimit: z.number().int().positive().optional(),
    })
    .optional(),
  tty: z.boolean().optional(),
  stdin: z.boolean().optional(),
});

export const PUT = jsonRoute<
  { id: string },
  z.infer<typeof updateContainerSchema>
>({
  auth: ({ params }) => requireSelfContainerAccess(params.id),
  body: updateContainerSchema,
  handler: ({ params, body }) => recreateContainer(params.id, body),
});
