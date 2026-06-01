import { z } from "zod/v4";
import { jsonRoute } from "@/lib/api/route";
import {
  listContainers,
  createContainer,
  startContainer,
  isSelfContainer,
} from "@/lib/docker/containers";

const createContainerSchema = z.object({
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
  autoStart: z.boolean().optional(),
});

export const GET = jsonRoute({
  auth: "authed",
  handler: async ({ session }) => {
    const containers = await listContainers();
    return session!.role === "admin"
      ? containers
      : containers.filter((c) => !isSelfContainer(c.id));
  },
});

export const POST = jsonRoute({
  auth: "authed",
  body: createContainerSchema,
  status: 201,
  handler: async ({ body }) => {
    const { autoStart, ...input } = body;
    const result = await createContainer(input);
    if (autoStart !== false) {
      await startContainer(result.id);
    }
    return result;
  },
});
