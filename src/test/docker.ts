import { Readable } from "stream";

export interface FakeStatsPayload {
  read: string;
  cpu_stats: {
    cpu_usage: { total_usage: number; percpu_usage?: number[] };
    system_cpu_usage: number;
    online_cpus?: number;
  };
  precpu_stats: {
    cpu_usage: { total_usage: number };
    system_cpu_usage: number;
    online_cpus?: number;
  };
  memory_stats: {
    usage: number;
    limit: number;
    stats?: { cache?: number; inactive_file?: number };
  };
  networks?: Record<string, { rx_bytes: number; tx_bytes: number }>;
  blkio_stats?: {
    io_service_bytes_recursive?: Array<{ op: string; value: number }>;
  };
  pids_stats?: { current?: number };
}

export function defaultStatsPayload(): FakeStatsPayload {
  return {
    read: new Date().toISOString(),
    cpu_stats: {
      cpu_usage: { total_usage: 2_000_000, percpu_usage: [1, 2] },
      system_cpu_usage: 100_000_000,
      online_cpus: 2,
    },
    precpu_stats: {
      cpu_usage: { total_usage: 1_000_000 },
      system_cpu_usage: 90_000_000,
      online_cpus: 2,
    },
    memory_stats: {
      usage: 50_000_000,
      limit: 1_000_000_000,
      stats: { cache: 5_000_000 },
    },
    networks: { eth0: { rx_bytes: 1000, tx_bytes: 2000 } },
    blkio_stats: {
      io_service_bytes_recursive: [
        { op: "Read", value: 4096 },
        { op: "Write", value: 8192 },
      ],
    },
    pids_stats: { current: 1 },
  };
}

interface FakeContainer {
  id: string;
  name: string;
  image: string;
  state: "created" | "running" | "exited" | "restarting";
  created: number;
  opts: {
    Image?: string;
    Env?: string[];
    Hostname?: string;
    Cmd?: string[];
    Entrypoint?: string[];
    Labels?: Record<string, string>;
    HostConfig?: {
      PortBindings?: Record<string, Array<{ HostPort: string; HostIp?: string }>>;
      Binds?: string[];
      RestartPolicy?: { Name: string; MaximumRetryCount: number };
      NetworkMode?: string;
      NanoCpus?: number;
      Memory?: number;
    };
  };
}

interface FakeImage {
  Id: string;
  RepoTags: string[];
  Size: number;
  Created: number;
}

export interface FakeStatsStream extends Readable {
  destroyed: boolean;
  destroyCalls: number;
}

/** Map stored PortBindings into the `Ports` shape `listContainers` exposes. */
function toPortList(c: FakeContainer) {
  const bindings = c.opts.HostConfig?.PortBindings ?? {};
  return Object.entries(bindings).flatMap(([key, hostBindings]) => {
    const [portStr, proto] = key.split("/");
    const privatePort = parseInt(portStr, 10);
    return (hostBindings ?? []).map((hb) => ({
      PrivatePort: privatePort,
      PublicPort: hb.HostPort ? parseInt(hb.HostPort, 10) : undefined,
      Type: proto || "tcp",
      IP: hb.HostIp,
    }));
  });
}

/** Map stored Binds ("src:dest:mode") into the `Mounts` shape `inspect` exposes. */
function toMountList(c: FakeContainer) {
  const binds = c.opts.HostConfig?.Binds ?? [];
  return binds.map((bind) => {
    const [source, destination, mode] = bind.split(":");
    return {
      Source: source ?? "",
      Destination: destination ?? "",
      Mode: mode ?? "",
      RW: mode !== "ro",
    };
  });
}

export class FakeDocker {
  private containers = new Map<string, FakeContainer>();
  private images = new Map<string, FakeImage>();
  private statsOverrides = new Map<string, FakeStatsPayload>();
  private streamStatsOverrides = new Map<string, FakeStatsPayload[]>();
  private lastStatsStream: FakeStatsStream | null = null;
  private nextContainerId = 1;

  setStats(id: string, payload: FakeStatsPayload): void {
    this.statsOverrides.set(id, payload);
  }

  setStreamStats(id: string, payloads: FakeStatsPayload[]): void {
    this.streamStatsOverrides.set(id, payloads);
  }

  getLastStatsStream(): FakeStatsStream | null {
    return this.lastStatsStream;
  }

  addImage(repoTag: string): void {
    const id = `sha256:${repoTag.replace(/[^a-zA-Z0-9]/g, "")}`;
    this.images.set(id, {
      Id: id,
      RepoTags: [repoTag],
      Size: 1000,
      Created: Math.floor(Date.now() / 1000),
    });
  }

  getContainers(): FakeContainer[] {
    return Array.from(this.containers.values());
  }

  async listContainers(opts: { all?: boolean } = {}) {
    return this.getContainers()
      .filter((c) => opts.all || c.state === "running")
      .map((c) => ({
        Id: c.id,
        Names: [`/${c.name}`],
        Image: c.image,
        State: c.state,
        Status: c.state,
        Ports: toPortList(c),
        Created: c.created,
      }));
  }

  async createContainer(opts: FakeContainer["opts"] & { name: string }) {
    const id = `fake${this.nextContainerId++}`;
    const container: FakeContainer = {
      id,
      name: opts.name,
      image: opts.Image ?? "",
      state: "created",
      created: Math.floor(Date.now() / 1000),
      opts,
    };
    this.containers.set(id, container);
    return this.getContainer(id);
  }

  getContainer(id: string) {
    const store = this.containers;
    const find = () => store.get(id);
    return {
      id,
      start: async () => {
        const c = find();
        if (!c) throw new Error(`No such container: ${id}`);
        c.state = "running";
      },
      stop: async () => {
        const c = find();
        if (!c) throw new Error(`No such container: ${id}`);
        c.state = "exited";
      },
      restart: async () => {
        const c = find();
        if (!c) throw new Error(`No such container: ${id}`);
        c.state = "running";
      },
      remove: async () => {
        if (!store.delete(id)) {
          throw new Error(`No such container: ${id}`);
        }
      },
      inspect: async () => {
        const c = find();
        if (!c) throw new Error(`No such container: ${id}`);
        const hostConfig = c.opts.HostConfig ?? {};
        return {
          Id: c.id,
          Name: `/${c.name}`,
          Config: {
            Image: c.image,
            Env: c.opts.Env ?? [],
            Hostname: c.opts.Hostname ?? "",
            Cmd: c.opts.Cmd ?? [],
            Entrypoint: c.opts.Entrypoint ?? [],
            Labels: c.opts.Labels ?? {},
          },
          State: { Status: c.state },
          Created: new Date(c.created * 1000).toISOString(),
          HostConfig: {
            PortBindings: hostConfig.PortBindings ?? {},
            Binds: hostConfig.Binds ?? [],
            RestartPolicy:
              hostConfig.RestartPolicy ?? { Name: "", MaximumRetryCount: 0 },
            NetworkMode: hostConfig.NetworkMode ?? "default",
            NanoCpus: hostConfig.NanoCpus ?? 0,
            Memory: hostConfig.Memory ?? 0,
          },
          Mounts: toMountList(c),
        };
      },
      logs: async () => Readable.from([]),
      exec: async () => ({
        start: async () => Readable.from([]),
        inspect: async () => ({ ExitCode: 0 }),
      }),
      stats: async (opts: { stream?: boolean } = { stream: true }) => {
        const payload = this.statsOverrides.get(id) ?? defaultStatsPayload();
        if (opts.stream === false) return payload;

        const frames =
          this.streamStatsOverrides.get(id) ?? [payload];
        const chunks = frames.map(
          (f) => Buffer.from(JSON.stringify(f) + "\n")
        );
        const stream = Readable.from(chunks) as FakeStatsStream;
        stream.destroyCalls = 0;
        const origDestroy = stream.destroy.bind(stream);
        // Track the call but let Node's real destroy set `destroyed`.
        // Pre-setting destroyed=true short-circuits Readable.destroy, which
        // breaks the async iterator's natural end signal under for-await.
        stream.destroy = ((...args: unknown[]) => {
          stream.destroyCalls++;
          return (origDestroy as (...a: unknown[]) => Readable)(...args);
        }) as typeof stream.destroy;
        this.lastStatsStream = stream;
        return stream;
      },
    };
  }

  async listImages() {
    return Array.from(this.images.values());
  }

  getImage(idOrTag: string) {
    const store = this.images;
    const resolve = () => {
      if (store.has(idOrTag)) return idOrTag;
      for (const [id, img] of store) {
        if (img.RepoTags.includes(idOrTag)) return id;
      }
      return null;
    };
    return {
      remove: async () => {
        const id = resolve();
        if (!id) throw new Error(`No such image: ${idOrTag}`);
        store.delete(id);
      },
    };
  }

  async pull(repoTag: string): Promise<Readable> {
    this.addImage(repoTag);
    return Readable.from([
      JSON.stringify({ status: "Pulling from " + repoTag }) + "\n",
      JSON.stringify({ status: "Complete" }) + "\n",
    ]);
  }

  reset(): void {
    this.containers.clear();
    this.images.clear();
    this.statsOverrides.clear();
    this.streamStatsOverrides.clear();
    this.lastStatsStream = null;
    this.nextContainerId = 1;
  }
}

declare global {
  var __testDocker: FakeDocker | undefined;
}

export function installFakeDocker(): FakeDocker {
  const fake = new FakeDocker();
  globalThis.__testDocker = fake;
  return fake;
}

export function getFakeDocker(): FakeDocker {
  if (!globalThis.__testDocker) {
    throw new Error(
      "Fake Docker not installed. Call installFakeDocker() in beforeEach."
    );
  }
  return globalThis.__testDocker;
}
