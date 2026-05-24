import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "stream";

const mockContainer = {
  inspect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  restart: vi.fn(),
  remove: vi.fn(),
  logs: vi.fn(),
  exec: vi.fn(),
};

const mockDocker = {
  listContainers: vi.fn(),
  getContainer: vi.fn(() => mockContainer),
  createContainer: vi.fn(),
};

vi.mock("./client", () => ({
  getDocker: () => mockDocker,
}));

let mockHostDataDir = "/docklet-data";

vi.mock("@/lib/db", () => ({
  getDataDir: () => "/docklet-data",
  getHostDataDir: () => mockHostDataDir,
}));

// Keep the real fs module and stub only mkdirSync, so unrelated fs usage
// (now or in the future) does not break against a partial mock.
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, mkdirSync: vi.fn() };
});

import { mkdirSync } from "fs";
import {
  listContainers,
  inspectContainer,
  createContainer,
  startContainer,
  stopContainer,
  restartContainer,
  removeContainer,
  containerLogLines,
  buildCreateOptions,
  resolveVolumePath,
} from "./containers";

beforeEach(() => {
  vi.clearAllMocks();
  mockHostDataDir = "/docklet-data";
});

describe("listContainers", () => {
  it("maps dockerode output to ContainerSummary", async () => {
    mockDocker.listContainers.mockResolvedValue([
      {
        Id: "abc123",
        Names: ["/my-container"],
        Image: "nginx:latest",
        State: "running",
        Status: "Up 3 hours",
        Ports: [{ PrivatePort: 80, PublicPort: 8080, Type: "tcp", IP: "0.0.0.0" }],
        Created: 1700000000,
      },
    ]);

    const result = await listContainers();
    expect(result).toEqual([
      {
        id: "abc123",
        name: "my-container",
        image: "nginx:latest",
        state: "running",
        status: "Up 3 hours",
        ports: [{ containerPort: 80, hostPort: 8080, protocol: "tcp", hostIp: "0.0.0.0" }],
        created: 1700000000,
      },
    ]);
  });

  it("when a container name has a leading slash — strips it", async () => {
    mockDocker.listContainers.mockResolvedValue([
      {
        Id: "def456",
        Names: ["/test"],
        Image: "alpine",
        State: "exited",
        Status: "Exited (0) 2 hours ago",
        Ports: [],
        Created: 1700000000,
      },
    ]);

    const result = await listContainers();
    expect(result[0].name).toBe("test");
  });

  it("when a published port has no public port — host port is undefined", async () => {
    mockDocker.listContainers.mockResolvedValue([
      {
        Id: "ghi789",
        Names: ["/internal"],
        Image: "redis",
        State: "running",
        Status: "Up 1 minute",
        Ports: [{ PrivatePort: 6379, Type: "tcp" }],
        Created: 1700000000,
      },
    ]);

    const result = await listContainers();
    expect(result[0].ports).toEqual([
      { containerPort: 6379, hostPort: undefined, protocol: "tcp", hostIp: undefined },
    ]);
  });

  it("when docker returns no containers — returns an empty array", async () => {
    mockDocker.listContainers.mockResolvedValue([]);
    const result = await listContainers();
    expect(result).toEqual([]);
  });
});

describe("inspectContainer", () => {
  it("maps a full inspect payload to ContainerDetail", async () => {
    mockContainer.inspect.mockResolvedValue({
      Id: "abc123",
      Name: "/my-container",
      Created: "2024-01-01T00:00:00Z",
      State: { Status: "running" },
      Config: {
        Image: "nginx:latest",
        Env: ["FOO=bar"],
        Hostname: "myhost",
        Cmd: ["nginx", "-g", "daemon off;"],
        Entrypoint: ["/docker-entrypoint.sh"],
        Labels: { app: "web" },
      },
      Mounts: [
        { Source: "/host/path", Destination: "/container/path", Mode: "rw", RW: true },
      ],
      HostConfig: {
        PortBindings: { "80/tcp": [{ HostPort: "8080", HostIp: "0.0.0.0" }] },
        RestartPolicy: { Name: "always", MaximumRetryCount: 0 },
        NetworkMode: "bridge",
        NanoCpus: 1000000000,
        Memory: 536870912,
      },
    });

    const result = await inspectContainer("abc123");
    expect(result).toEqual({
      id: "abc123",
      name: "my-container",
      image: "nginx:latest",
      state: "running",
      status: "running",
      ports: [{ containerPort: 80, hostPort: 8080, protocol: "tcp", hostIp: "0.0.0.0" }],
      created: new Date("2024-01-01T00:00:00Z").getTime() / 1000,
      env: ["FOO=bar"],
      mounts: [
        { source: "/host/path", destination: "/container/path", mode: "rw", rw: true },
      ],
      restartPolicy: { name: "always", maximumRetryCount: 0 },
      networkMode: "bridge",
      hostname: "myhost",
      cmd: ["nginx", "-g", "daemon off;"],
      entrypoint: ["/docker-entrypoint.sh"],
      labels: { app: "web" },
      resources: { cpuLimit: 1, memoryLimit: 536870912 },
    });
  });

  it("when optional inspect fields are absent — applies documented defaults", async () => {
    mockContainer.inspect.mockResolvedValue({
      Id: "min1",
      Name: "minimal",
      Created: "2024-06-01T12:00:00Z",
      State: { Status: "exited" },
      Config: { Image: "alpine" },
      Mounts: [],
      HostConfig: {},
    });

    const result = await inspectContainer("min1");
    expect(result).toEqual({
      id: "min1",
      name: "minimal",
      image: "alpine",
      state: "exited",
      status: "exited",
      ports: [],
      created: new Date("2024-06-01T12:00:00Z").getTime() / 1000,
      env: [],
      mounts: [],
      restartPolicy: { name: "", maximumRetryCount: 0 },
      networkMode: "default",
      hostname: "",
      cmd: [],
      entrypoint: [],
      labels: {},
      resources: { cpuLimit: undefined, memoryLimit: undefined },
    });
  });
});

describe("buildCreateOptions", () => {
  it("maps name and image onto dockerode create options", () => {
    const opts = buildCreateOptions({ name: "web", image: "nginx:latest" });
    expect(opts.name).toBe("web");
    expect(opts.Image).toBe("nginx:latest");
  });

  it("builds exposed ports and host port bindings", () => {
    const opts = buildCreateOptions({
      name: "web",
      image: "nginx",
      ports: [{ containerPort: 80, hostPort: 8080, protocol: "tcp" }],
    });
    expect(opts.ExposedPorts).toEqual({ "80/tcp": {} });
    expect(opts.HostConfig?.PortBindings).toEqual({
      "80/tcp": [{ HostPort: "8080" }],
    });
  });

  it("builds volume binds from pre-resolved volumes", () => {
    const opts = buildCreateOptions({
      name: "web",
      image: "nginx",
      volumes: [
        { hostPath: "/docklet-data/volumes/test/app/data", containerPath: "/app/data", mode: "ro" },
      ],
    });
    expect(opts.HostConfig?.Binds).toEqual([
      "/docklet-data/volumes/test/app/data:/app/data:ro",
    ]);
  });

  it("builds CPU and memory resource limits", () => {
    const opts = buildCreateOptions({
      name: "web",
      image: "nginx",
      resources: { cpuLimit: 2, memoryLimit: 1073741824 },
    });
    expect(opts.HostConfig?.NanoCpus).toBe(2e9);
    expect(opts.HostConfig?.Memory).toBe(1073741824);
  });

  it("builds the restart policy", () => {
    const opts = buildCreateOptions({
      name: "web",
      image: "nginx",
      restartPolicy: { name: "on-failure", maximumRetryCount: 5 },
    });
    expect(opts.HostConfig?.RestartPolicy).toEqual({
      Name: "on-failure",
      MaximumRetryCount: 5,
    });
  });
});

describe("container lifecycle actions", () => {
  it("starts a container by id", async () => {
    mockContainer.start.mockResolvedValue(undefined);
    await startContainer("abc123");
    expect(mockDocker.getContainer).toHaveBeenCalledWith("abc123");
    expect(mockContainer.start).toHaveBeenCalled();
  });

  it("stops a container by id", async () => {
    mockContainer.stop.mockResolvedValue(undefined);
    await stopContainer("abc123");
    expect(mockDocker.getContainer).toHaveBeenCalledWith("abc123");
    expect(mockContainer.stop).toHaveBeenCalled();
  });

  it("restarts a container by id", async () => {
    mockContainer.restart.mockResolvedValue(undefined);
    await restartContainer("abc123");
    expect(mockDocker.getContainer).toHaveBeenCalledWith("abc123");
    expect(mockContainer.restart).toHaveBeenCalled();
  });

  it("removes a container with force=false by default", async () => {
    mockContainer.remove.mockResolvedValue(undefined);
    await removeContainer("abc123");
    expect(mockDocker.getContainer).toHaveBeenCalledWith("abc123");
    expect(mockContainer.remove).toHaveBeenCalledWith({ force: false });
  });

  it("when force is requested — passes the force flag to docker", async () => {
    mockContainer.remove.mockResolvedValue(undefined);
    await removeContainer("abc123", true);
    expect(mockContainer.remove).toHaveBeenCalledWith({ force: true });
  });
});

describe("createContainer", () => {
  it("creates the container and returns its id", async () => {
    mockDocker.createContainer.mockResolvedValue({ id: "new123" });
    const result = await createContainer({ name: "test", image: "nginx:latest" });
    expect(result.id).toBe("new123");
    expect(mockDocker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({ name: "test", Image: "nginx:latest" })
    );
  });

  it("resolves volume paths and creates the host directories", async () => {
    mockDocker.createContainer.mockResolvedValue({ id: "vol123" });
    await createContainer({
      name: "mc-server",
      image: "itzg/minecraft-server",
      volumes: [{ containerPath: "/data" }],
    });
    expect(mkdirSync).toHaveBeenCalledWith("/docklet-data/volumes/mc-server/data", {
      recursive: true,
    });
    expect(mockDocker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        HostConfig: expect.objectContaining({
          Binds: ["/docklet-data/volumes/mc-server/data:/data:rw"],
        }),
      })
    );
  });

  it("when HOST_DATA_DIR differs from DOCKLET_DATA_DIR — the bind mount uses the host path", async () => {
    mockHostDataDir = "/Users/david/docklet-data";
    mockDocker.createContainer.mockResolvedValue({ id: "host123" });

    await createContainer({
      name: "myapp",
      image: "nginx",
      volumes: [{ containerPath: "/var/www" }],
    });

    expect(mockDocker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        HostConfig: expect.objectContaining({
          Binds: ["/Users/david/docklet-data/volumes/myapp/var/www:/var/www:rw"],
        }),
      })
    );
  });
});

describe("resolveVolumePath", () => {
  it("resolves a simple container path under the managed volumes root", () => {
    expect(resolveVolumePath("mc-server", "/data")).toBe(
      "/docklet-data/volumes/mc-server/data"
    );
  });

  it("resolves a nested container path", () => {
    expect(resolveVolumePath("my-app", "/config/nginx")).toBe(
      "/docklet-data/volumes/my-app/config/nginx"
    );
  });

  it("strips multiple leading slashes", () => {
    expect(resolveVolumePath("app", "//data")).toBe("/docklet-data/volumes/app/data");
  });

  it("when the path traverses above root with a leading segment — throws Invalid volume path", () => {
    expect(() => resolveVolumePath("app", "/../etc")).toThrow("Invalid volume path");
  });

  it("when the path traverses above root mid-path — throws Invalid volume path", () => {
    expect(() => resolveVolumePath("app", "/data/../etc")).toThrow("Invalid volume path");
  });
});

/** Build a Docker non-TTY log frame: one 8-byte header + utf8 payload.
 *  The first header byte is the stream id (1=stdout, 2=stderr); the
 *  implementation only checks that it is ≤ 2, so we pass 1. */
function dockerLogFrame(payload: string): Buffer {
  const header = Buffer.from([1, 0, 0, 0, 0, 0, 0, 0]);
  return Buffer.concat([header, Buffer.from(payload, "utf-8")]);
}

async function collect(gen: AsyncGenerator<string>, max = 100): Promise<string[]> {
  const out: string[] = [];
  for await (const value of gen) {
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

describe("containerLogLines", () => {
  it("strips Docker's 8-byte multiplex header from non-TTY frames", async () => {
    mockContainer.logs.mockResolvedValue(
      Readable.from([dockerLogFrame("hello world\n")])
    );

    const lines = await collect(containerLogLines("abc"));
    expect(lines.map((l) => JSON.parse(l))).toEqual(["hello world"]);
  });

  it("when a line is short or its first byte is > 2 — leaves it untouched (TTY mode)", async () => {
    // TTY containers emit plain text without the 8-byte header. The leading
    // 'H' (0x48) sits well above the stream-id range so the strip must not fire.
    mockContainer.logs.mockResolvedValue(Readable.from([Buffer.from("Hello\n", "utf-8")]));

    const lines = await collect(containerLogLines("abc"));
    expect(lines.map((l) => JSON.parse(l))).toEqual(["Hello"]);
  });

  it("skips blank lines between frames", async () => {
    mockContainer.logs.mockResolvedValue(
      Readable.from([dockerLogFrame("first\n\nsecond\n   \n")])
    );

    const lines = await collect(containerLogLines("abc"));
    // Only the header-bearing first line gets its header stripped; subsequent
    // lines within the same chunk are passed through whole, which is the
    // existing implementation's documented behaviour.
    expect(lines.map((l) => JSON.parse(l))).toEqual(["first", "second"]);
  });

  it("forwards the tail option to docker", async () => {
    mockContainer.logs.mockResolvedValue(Readable.from([]));

    await collect(containerLogLines("abc", { tail: 50 }));
    expect(mockContainer.logs).toHaveBeenLastCalledWith({
      follow: true,
      stdout: true,
      stderr: true,
      tail: 50,
    });
  });

  it("when the consumer stops iterating — destroys the upstream stream", async () => {
    const stream = Readable.from([dockerLogFrame("one\n"), dockerLogFrame("two\n")]);
    const destroySpy = vi.spyOn(stream, "destroy");
    mockContainer.logs.mockResolvedValue(stream);

    const gen = containerLogLines("abc");
    await gen.next();
    await gen.return(undefined);

    expect(destroySpy).toHaveBeenCalled();
  });
});
