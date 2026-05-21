import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("systeminformation", () => ({
  default: {
    currentLoad: vi.fn(),
    mem: vi.fn(),
    fsSize: vi.fn(),
    osInfo: vi.fn(),
    cpu: vi.fn(),
  },
}));

vi.mock("os", () => ({
  default: {
    cpus: vi.fn(() => new Array(4)),
    uptime: vi.fn(() => 987_654),
  },
}));

const mockDocker = {
  listContainers: vi.fn(),
  listImages: vi.fn(),
};

vi.mock("@/lib/docker/client", () => ({
  getDocker: () => mockDocker,
}));

import si from "systeminformation";
import { getSystemStats } from "./stats";

type LoadData = Awaited<ReturnType<typeof si.currentLoad>>;
type MemData = Awaited<ReturnType<typeof si.mem>>;
type FsData = Awaited<ReturnType<typeof si.fsSize>>[number];
type OsData = Awaited<ReturnType<typeof si.osInfo>>;
type CpuData = Awaited<ReturnType<typeof si.cpu>>;

/** Build a systeminformation payload with only the fields the implementation
 *  reads, while still type-checking those keys (unlike a blanket `as never`). */
function partial<T>(value: Partial<T>): T {
  return value as T;
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(si.currentLoad).mockResolvedValue(partial<LoadData>({ currentLoad: 42.55 }));
  vi.mocked(si.mem).mockResolvedValue(
    partial<MemData>({ total: 8_000_000_000, available: 4_000_000_000, free: 500_000_000 })
  );
  vi.mocked(si.fsSize).mockResolvedValue([
    partial<FsData>({ mount: "/boot", size: 100, used: 50 }),
    partial<FsData>({ mount: "/", size: 1_000, used: 500 }),
  ]);
  vi.mocked(si.osInfo).mockResolvedValue(
    partial<OsData>({ platform: "linux", distro: "Ubuntu", release: "22.04" })
  );
  vi.mocked(si.cpu).mockResolvedValue(
    partial<CpuData>({ cores: 8, manufacturer: "Intel", brand: "i7" })
  );

  mockDocker.listContainers.mockResolvedValue([
    { State: "running" },
    { State: "running" },
    { State: "exited" },
  ]);
  mockDocker.listImages.mockResolvedValue([{ Id: "a" }, { Id: "b" }]);
});

describe("getSystemStats", () => {
  it("assembles a complete snapshot from systeminformation and docker", async () => {
    const stats = await getSystemStats();

    expect(stats).toEqual({
      cpu: { load: 42.6, cores: 8, model: "Intel i7" },
      mem: { used: 4_000_000_000, total: 8_000_000_000, free: 4_000_000_000 },
      disk: { used: 500, total: 1_000, mountpoint: "/" },
      uptime: 987_654,
      os: { platform: "linux", distro: "Ubuntu", release: "22.04" },
      docker: { running: 2, stopped: 1, total: 3, images: 2 },
    });
  });

  it("rounds CPU load to one decimal place", async () => {
    vi.mocked(si.currentLoad).mockResolvedValue(partial<LoadData>({ currentLoad: 87.62 }));
    const stats = await getSystemStats();
    expect(stats.cpu.load).toBe(87.6);
  });

  it("when the CPU manufacturer is empty — the model uses only the brand", async () => {
    vi.mocked(si.cpu).mockResolvedValue(
      partial<CpuData>({ cores: 8, manufacturer: "", brand: "i7" })
    );
    const stats = await getSystemStats();
    expect(stats.cpu.model).toBe("i7");
  });

  it("when both CPU manufacturer and brand are empty — the model is an empty string", async () => {
    vi.mocked(si.cpu).mockResolvedValue(
      partial<CpuData>({ cores: 8, manufacturer: "", brand: "" })
    );
    const stats = await getSystemStats();
    expect(stats.cpu.model).toBe("");
  });

  it("when systeminformation omits the CPU core count — falls back to the os.cpus() count", async () => {
    vi.mocked(si.cpu).mockResolvedValue(
      partial<CpuData>({ manufacturer: "AMD", brand: "Ryzen" })
    );
    const stats = await getSystemStats();
    expect(stats.cpu.cores).toBe(4);
  });

  it("when available memory is absent — used and free derive from the free field", async () => {
    vi.mocked(si.mem).mockResolvedValue(
      partial<MemData>({ total: 8_000_000_000, free: 500_000_000 })
    );
    const stats = await getSystemStats();
    expect(stats.mem).toEqual({
      used: 7_500_000_000,
      total: 8_000_000_000,
      free: 500_000_000,
    });
  });

  it("when multiple filesystems are reported — picks the largest by size", async () => {
    vi.mocked(si.fsSize).mockResolvedValue([
      partial<FsData>({ mount: "/a", size: 10, used: 5 }),
      partial<FsData>({ mount: "/b", size: 9_999, used: 100 }),
    ]);
    const stats = await getSystemStats();
    expect(stats.disk).toEqual({ used: 100, total: 9_999, mountpoint: "/b" });
  });

  it("when no filesystems are reported — disk falls back to zero size and the root mountpoint", async () => {
    vi.mocked(si.fsSize).mockResolvedValue([]);
    const stats = await getSystemStats();
    expect(stats.disk).toEqual({ used: 0, total: 0, mountpoint: "/" });
  });

  it("when docker is unavailable — docker counts default to zero", async () => {
    mockDocker.listContainers.mockRejectedValue(new Error("docker down"));
    mockDocker.listImages.mockRejectedValue(new Error("docker down"));
    const stats = await getSystemStats();
    expect(stats.docker).toEqual({ running: 0, stopped: 0, total: 0, images: 0 });
  });

  it("when every systeminformation call fails — falls back to OS-level defaults", async () => {
    const down = new Error("systeminformation unavailable");
    vi.mocked(si.currentLoad).mockRejectedValue(down);
    vi.mocked(si.mem).mockRejectedValue(down);
    vi.mocked(si.fsSize).mockRejectedValue(down);
    vi.mocked(si.osInfo).mockRejectedValue(down);
    vi.mocked(si.cpu).mockRejectedValue(down);

    const stats = await getSystemStats();

    expect(stats).toEqual({
      cpu: { load: 0, cores: 4, model: "" },
      mem: { used: 0, total: 0, free: 0 },
      disk: { used: 0, total: 0, mountpoint: "/" },
      uptime: 987_654,
      os: { platform: process.platform, distro: "", release: "" },
      docker: { running: 2, stopped: 1, total: 3, images: 2 },
    });
  });
});
