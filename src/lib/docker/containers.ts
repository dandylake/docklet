import { mkdirSync } from "fs";
import { resolve } from "path";
import { hostname } from "os";
import { randomBytes } from "crypto";
import { getDocker } from "./client";
import { destroyStream } from "./stream-utils";
import { getDataDir, getHostDataDir } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type {
  ContainerSummary,
  ContainerDetail,
  CreateContainerInput,
  PortBinding,
  VolumeMount,
} from "./types";

/** Extract the editable spec from an inspected container, ready to feed back
 *  into createContainer. Mirrors the field set the edit form handles today;
 *  labels, entrypoint, networkMode, tty, and stdin are intentionally dropped
 *  because the form does not surface them. */
export function containerDetailToCreateInput(
  detail: ContainerDetail
): CreateContainerInput {
  const input: CreateContainerInput = {
    name: detail.name,
    image: detail.image,
  };
  if (detail.ports.length > 0) input.ports = detail.ports;
  if (detail.env.length > 0) input.env = detail.env;
  if (detail.mounts.length > 0) {
    input.volumes = detail.mounts.map((m) => ({
      containerPath: m.destination,
      mode: m.rw ? "rw" : "ro",
    }));
  }
  if (detail.restartPolicy.name) {
    input.restartPolicy = {
      name: detail.restartPolicy.name,
      maximumRetryCount: detail.restartPolicy.maximumRetryCount,
    };
  }
  if (detail.hostname) input.hostname = detail.hostname;
  if (detail.cmd.length > 0) input.cmd = detail.cmd;
  if (detail.resources.cpuLimit != null || detail.resources.memoryLimit != null) {
    input.resources = { ...detail.resources };
  }
  return input;
}
import type Dockerode from "dockerode";

/** Internal type used by buildCreateOptions (host path already resolved) */
interface ResolvedVolume {
  hostPath: string;
  containerPath: string;
  mode: string;
}

/** Convert a container path to a managed host path under $DOCKLET_DATA_DIR/volumes.
 *  Throws if the path contains ".." segments to prevent directory traversal. */
export function resolveVolumePath(containerName: string, containerPath: string): string {
  const stripped = containerPath.replace(/^\/+/, "");
  if (stripped.split("/").some((seg) => seg === "..")) {
    throw new Error(`Invalid volume path: ${containerPath}`);
  }
  return resolve(getDataDir(), "volumes", containerName, stripped);
}

function parsePortBindings(
  ports: Dockerode.Port[] | undefined
): PortBinding[] {
  if (!ports) return [];
  return ports.map((p) => ({
    containerPort: p.PrivatePort,
    hostPort: p.PublicPort,
    protocol: (p.Type as "tcp" | "udp") || "tcp",
    hostIp: p.IP,
  }));
}

function parseMounts(
  mounts: Dockerode.ContainerInspectInfo["Mounts"]
): VolumeMount[] {
  return mounts.map((m) => ({
    source: m.Source ?? "",
    destination: m.Destination,
    mode: m.Mode ?? "",
    rw: m.RW,
  }));
}

export async function listContainers(): Promise<ContainerSummary[]> {
  const docker = getDocker();
  const containers = await docker.listContainers({ all: true });
  return containers.map((c) => ({
    id: c.Id,
    name: (c.Names[0] ?? "").replace(/^\//, ""),
    image: c.Image,
    state: c.State,
    status: c.Status,
    ports: parsePortBindings(c.Ports),
    created: c.Created,
  }));
}

export async function inspectContainer(
  id: string
): Promise<ContainerDetail> {
  const docker = getDocker();
  const container = docker.getContainer(id);
  const info = await container.inspect();

  const hostConfig = info.HostConfig;
  const nanoCpus = hostConfig.NanoCpus ?? 0;
  const memoryBytes = hostConfig.Memory ?? 0;

  // Parse port bindings from inspect info
  const ports: PortBinding[] = [];
  const portBindings = hostConfig.PortBindings ?? {};
  for (const [containerPortProto, hostBindings] of Object.entries(portBindings)) {
    const [portStr, proto] = containerPortProto.split("/");
    const containerPort = parseInt(portStr, 10);
    if (Array.isArray(hostBindings)) {
      for (const hb of hostBindings as Array<{ HostPort: string; HostIp?: string }>) {
        ports.push({
          containerPort,
          hostPort: hb.HostPort ? parseInt(hb.HostPort, 10) : undefined,
          protocol: (proto as "tcp" | "udp") || "tcp",
          hostIp: hb.HostIp || undefined,
        });
      }
    }
  }

  return {
    id: info.Id,
    name: info.Name.replace(/^\//, ""),
    image: info.Config.Image,
    state: info.State.Status,
    status: info.State.Status,
    ports,
    created: new Date(info.Created).getTime() / 1000,
    env: info.Config.Env ?? [],
    mounts: parseMounts(info.Mounts),
    restartPolicy: {
      name: hostConfig.RestartPolicy?.Name ?? "",
      maximumRetryCount: hostConfig.RestartPolicy?.MaximumRetryCount ?? 0,
    },
    networkMode: hostConfig.NetworkMode ?? "default",
    hostname: info.Config.Hostname ?? "",
    cmd: Array.isArray(info.Config.Cmd) ? info.Config.Cmd : [],
    entrypoint: Array.isArray(info.Config.Entrypoint) ? info.Config.Entrypoint : [],
    labels: info.Config.Labels ?? {},
    resources: {
      cpuLimit: nanoCpus > 0 ? nanoCpus / 1e9 : undefined,
      memoryLimit: memoryBytes > 0 ? memoryBytes : undefined,
    },
  };
}

function buildCreateOptions(
  input: Omit<CreateContainerInput, "volumes"> & { volumes?: ResolvedVolume[] }
): Dockerode.ContainerCreateOptions {
  const exposedPorts: Record<string, object> = {};
  const portBindings: Record<string, Array<{ HostPort: string; HostIp?: string }>> = {};

  if (input.ports) {
    for (const p of input.ports) {
      const key = `${p.containerPort}/${p.protocol || "tcp"}`;
      exposedPorts[key] = {};
      portBindings[key] = [
        {
          HostPort: p.hostPort != null ? String(p.hostPort) : "",
          ...(p.hostIp ? { HostIp: p.hostIp } : {}),
        },
      ];
    }
  }

  const binds: string[] = [];
  if (input.volumes) {
    for (const v of input.volumes) {
      binds.push(`${v.hostPath}:${v.containerPath}:${v.mode}`);
    }
  }

  return {
    name: input.name,
    Image: input.image,
    Cmd: input.cmd,
    Hostname: input.hostname,
    Env: input.env,
    Labels: input.labels,
    Tty: input.tty ?? false,
    OpenStdin: input.stdin ?? false,
    ExposedPorts: exposedPorts,
    HostConfig: {
      PortBindings: portBindings,
      Binds: binds.length > 0 ? binds : undefined,
      RestartPolicy: input.restartPolicy
        ? {
            Name: input.restartPolicy.name,
            MaximumRetryCount: input.restartPolicy.maximumRetryCount ?? 0,
          }
        : undefined,
      NetworkMode: input.networkMode,
      NanoCpus: input.resources?.cpuLimit
        ? input.resources.cpuLimit * 1e9
        : undefined,
      Memory: input.resources?.memoryLimit,
    },
  };
}

export async function createContainer(
  input: CreateContainerInput
): Promise<{ id: string }> {
  const docker = getDocker();

  const resolvedVolumes: ResolvedVolume[] = (input.volumes ?? []).map((v) => {
    const localPath = resolveVolumePath(input.name, v.containerPath);
    mkdirSync(localPath, { recursive: true });
    // When HOST_DATA_DIR differs from DOCKLET_DATA_DIR (e.g. Docker Desktop on Mac),
    // Docker needs the bind mount path as it appears on the host, not inside this container.
    const hostPath = getHostDataDir() + localPath.slice(getDataDir().length);
    return { hostPath, containerPath: v.containerPath, mode: v.mode ?? "rw" };
  });

  const opts = buildCreateOptions({ ...input, volumes: resolvedVolumes });
  const container = await docker.createContainer(opts);
  return { id: container.id };
}

export async function startContainer(id: string): Promise<void> {
  const docker = getDocker();
  await docker.getContainer(id).start();
}

export async function stopContainer(id: string): Promise<void> {
  const docker = getDocker();
  await docker.getContainer(id).stop();
}

export async function restartContainer(id: string): Promise<void> {
  const docker = getDocker();
  await docker.getContainer(id).restart();
}

export async function removeContainer(
  id: string,
  force = false
): Promise<void> {
  const docker = getDocker();
  await docker.getContainer(id).remove({ force });
}

export async function renameContainer(id: string, name: string): Promise<void> {
  const docker = getDocker();
  await docker.getContainer(id).rename({ name });
}

/** Thrown when the new container could not be created and the original was
 *  successfully restored (same id, runtime data intact). */
export class RecreateRolledBackError extends AppError {
  constructor(public readonly createCause: unknown) {
    const msg = createCause instanceof Error ? createCause.message : String(createCause);
    super(500, `Update failed; original container restored. Cause: ${msg}`);
    this.name = "RecreateRolledBackError";
  }
}

/** Thrown when the new container could not be created AND rollback (renaming
 *  the original back to its name) also failed. The original container still
 *  exists on the host under `orphanedName`; recovery requires manual rename. */
export class RecreateLostError extends AppError {
  constructor(
    public readonly orphanedName: string,
    public readonly createCause: unknown,
    public readonly rollbackCause: unknown
  ) {
    const createMsg = createCause instanceof Error ? createCause.message : String(createCause);
    const rbMsg = rollbackCause instanceof Error ? rollbackCause.message : String(rollbackCause);
    super(
      500,
      `Update failed and original could not be restored; the original container ` +
        `is still on the host under the temporary name "${orphanedName}". ` +
        `Create error: ${createMsg}. Rollback error: ${rbMsg}.`
    );
    this.name = "RecreateLostError";
  }
}

/** Replace the container at `id` with a new one built from `newSpec`, using a
 *  rename-aside dance so that a failed create leaves the original intact:
 *
 *    1. Inspect to capture name and running state.
 *    2. Stop the original if it was running, freeing its ports and network.
 *    3. Rename the original to a unique temporary name.
 *    4. Create the new container, claiming the original's name.
 *    5. Remove the (renamed) original.
 *
 *  On failure of step 4, step 3 is reversed; the original keeps its id and
 *  runtime data. On failure of step 5 (post-success cleanup), the new
 *  container is the desired state and the error is swallowed with a log.
 *  The new container is created in the stopped state; callers that want it
 *  running must call startContainer separately. */
export async function recreateContainer(
  id: string,
  newSpec: CreateContainerInput
): Promise<{ id: string }> {
  const detail = await inspectContainer(id);
  const originalName = detail.name;
  const tempName = `${originalName}__docklet_recreate_${randomBytes(4).toString("hex")}`;

  if (detail.state === "running") {
    await stopContainer(id);
  }

  await renameContainer(id, tempName);

  let result: { id: string };
  try {
    result = await createContainer(newSpec);
  } catch (createErr) {
    try {
      await renameContainer(id, originalName);
    } catch (rollbackErr) {
      throw new RecreateLostError(tempName, createErr, rollbackErr);
    }
    throw new RecreateRolledBackError(createErr);
  }

  try {
    await removeContainer(id, true);
  } catch (cleanupErr) {
    console.error("recreate: cleanup of original container failed", cleanupErr);
  }

  return result;
}

/** Yields container log lines as JSON-encoded strings (one string per line,
 *  ready for SSE framing). Strips Docker's 8-byte frame header on non-TTY
 *  streams. Destroys the upstream log stream when the consumer disconnects. */
export async function* containerLogLines(
  id: string,
  opts: { tail?: number } = {}
): AsyncGenerator<string> {
  const docker = getDocker();
  const container = docker.getContainer(id);
  const stream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    tail: opts.tail ?? 200,
  });

  try {
    for await (const chunk of stream as unknown as AsyncIterable<Buffer>) {
      const text = chunk.toString("utf-8");
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        // Docker multiplexes stdout/stderr with an 8-byte header per frame
        // on non-TTY containers; the first byte is the stream id (0, 1, or 2).
        const clean =
          line.length > 8 && line.charCodeAt(0) <= 2 ? line.slice(8) : line;
        yield JSON.stringify(clean);
      }
    }
  } finally {
    destroyStream(stream);
  }
}

export async function execInContainer(
  id: string,
  cmd: string[]
): Promise<{ output: string; exitCode: number }> {
  const docker = getDocker();
  const container = docker.getContainer(id);
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({ hijack: true, stdin: false });

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", async () => {
      const output = Buffer.concat(chunks).toString("utf-8");
      try {
        const inspection = await exec.inspect();
        resolve({ output, exitCode: inspection.ExitCode ?? -1 });
      } catch {
        resolve({ output, exitCode: -1 });
      }
    });
  });
}

/** Returns true if the given container ID matches the running Docklet instance.
 *  Docker sets container hostname to the 12-char short container ID.
 *  Returns false when not running inside a container (e.g. in development). */
export function isSelfContainer(id: string): boolean {
  const self = hostname();
  if (!/^[0-9a-f]{12}$/.test(self)) return false;
  return id.startsWith(self) || self.startsWith(id);
}

// Exported for testing
export { buildCreateOptions };
