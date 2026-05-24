import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireSelfContainerAccess, handleApiError } from "@/lib/auth/middleware";
import {
  inspectContainer,
  stopContainer,
  removeContainer,
  createContainer,
  startContainer,
} from "@/lib/docker/containers";

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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await requireSelfContainerAccess(id);
    const body = await request.json();
    const input = updateContainerSchema.parse(body);

    // Check current state to know whether to restart after recreate
    const current = await inspectContainer(id);
    const wasRunning = current.state === "running";

    // Stop and remove old container
    if (wasRunning) {
      await stopContainer(id);
    }
    await removeContainer(id, true);

    // Create new container with updated config
    const result = await createContainer(input);

    // Start if the old one was running
    if (wasRunning) {
      await startContainer(result.id);
    }

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
