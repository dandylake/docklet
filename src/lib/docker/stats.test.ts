import { describe, it, expect, vi, beforeEach } from "vitest";
import { faker } from "@faker-js/faker";

const mockContainer = {
  stats: vi.fn(),
};

const mockDocker = {
  listContainers: vi.fn(),
  getContainer: vi.fn(() => mockContainer),
};

vi.mock("./client", () => ({
  getDocker: () => mockDocker,
}));

import { Readable } from "stream";
import {
  computeCpuPercent,
  computeMemoryUsage,
  computeNetworkIO,
  computeBlockIO,
  normalizeStats,
  aggregateOverview,
  getContainerStatsSnapshot,
  getOverview,
  overviewStream,
  containerStatsFrames,
  type RawStats,
  type ContainerStats,
} from "./stats";

function makeRawStats(overrides: Partial<RawStats> = {}): RawStats {
  return {
    read: "2026-04-23T12:00:00Z",
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
      usage: 100_000_000,
      limit: 1_000_000_000,
      stats: { cache: 10_000_000 },
    },
    networks: {
      eth0: { rx_bytes: 1000, tx_bytes: 2000 },
    },
    blkio_stats: {
      io_service_bytes_recursive: [
        { op: "Read", value: 4096 },
        { op: "Write", value: 8192 },
      ],
    },
    pids_stats: { current: 7 },
    ...overrides,
  };
}

function makeContainerStats(
  overrides: Partial<ContainerStats> = {}
): ContainerStats {
  return {
    id: faker.string.hexadecimal({ length: 12, prefix: "" }),
    name: faker.word.noun(),
    state: "running",
    cpuPercent: 10,
    memory: { used: 50, limit: 500, percent: 10 },
    network: { rx: 100, tx: 200 },
    block: { read: 300, write: 400 },
    pids: 1,
    read: "2026-04-23T12:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("computeCpuPercent", () => {
  it("when cpu_delta and system_delta are positive — returns percent scaled by online_cpus", () => {
    const raw = makeRawStats({
      cpu_stats: {
        cpu_usage: { total_usage: 2_000_000 },
        system_cpu_usage: 100_000_000,
        online_cpus: 4,
      },
      precpu_stats: {
        cpu_usage: { total_usage: 1_000_000 },
        system_cpu_usage: 90_000_000,
        online_cpus: 4,
      },
    });

    const pct = computeCpuPercent(raw);

    expect(pct).toBeCloseTo((1_000_000 / 10_000_000) * 4 * 100, 5);
  });

  it("when system_delta is zero — returns 0 without dividing by zero", () => {
    const raw = makeRawStats({
      cpu_stats: {
        cpu_usage: { total_usage: 2_000_000 },
        system_cpu_usage: 100_000_000,
        online_cpus: 2,
      },
      precpu_stats: {
        cpu_usage: { total_usage: 1_000_000 },
        system_cpu_usage: 100_000_000,
        online_cpus: 2,
      },
    });

    expect(computeCpuPercent(raw)).toBe(0);
  });

  it("when online_cpus is missing — falls back to percpu_usage length", () => {
    const raw = makeRawStats({
      cpu_stats: {
        cpu_usage: { total_usage: 2_000_000, percpu_usage: [1, 2, 3, 4] },
        system_cpu_usage: 100_000_000,
      },
      precpu_stats: {
        cpu_usage: { total_usage: 1_000_000 },
        system_cpu_usage: 90_000_000,
      },
    });

    expect(computeCpuPercent(raw)).toBeCloseTo(
      (1_000_000 / 10_000_000) * 4 * 100,
      5
    );
  });

  it("when precpu_stats matches cpu_stats (first frame) — returns 0", () => {
    const raw = makeRawStats({
      cpu_stats: {
        cpu_usage: { total_usage: 2_000_000 },
        system_cpu_usage: 100_000_000,
        online_cpus: 2,
      },
      precpu_stats: {
        cpu_usage: { total_usage: 2_000_000 },
        system_cpu_usage: 100_000_000,
        online_cpus: 2,
      },
    });

    expect(computeCpuPercent(raw)).toBe(0);
  });

  it("when precpu_stats fields are missing on the first stream frame — returns a finite number and never NaN", () => {
    const raw = makeRawStats({
      cpu_stats: {
        cpu_usage: { total_usage: 2_000_000 },
        system_cpu_usage: 100_000_000,
        online_cpus: 2,
      },
      precpu_stats: {
        cpu_usage: { total_usage: undefined as unknown as number },
        system_cpu_usage: undefined as unknown as number,
      },
    });

    expect(Number.isFinite(computeCpuPercent(raw))).toBe(true);
  });
});

describe("computeMemoryUsage", () => {
  it("when stats.cache is present — subtracts cache from raw usage", () => {
    const raw = makeRawStats({
      memory_stats: {
        usage: 100_000_000,
        limit: 1_000_000_000,
        stats: { cache: 30_000_000 },
      },
    });

    expect(computeMemoryUsage(raw).used).toBe(70_000_000);
  });

  it("when stats.cache is absent but inactive_file is present — uses inactive_file", () => {
    const raw = makeRawStats({
      memory_stats: {
        usage: 100_000_000,
        limit: 1_000_000_000,
        stats: { inactive_file: 20_000_000 },
      },
    });

    expect(computeMemoryUsage(raw).used).toBe(80_000_000);
  });

  it("when neither cache nor inactive_file is present — used equals raw usage", () => {
    const raw = makeRawStats({
      memory_stats: { usage: 100_000_000, limit: 1_000_000_000, stats: {} },
    });

    expect(computeMemoryUsage(raw).used).toBe(100_000_000);
  });

  it("when limit is 0 — returns percent 0 without dividing by zero", () => {
    const raw = makeRawStats({
      memory_stats: { usage: 100_000_000, limit: 0, stats: { cache: 0 } },
    });

    expect(computeMemoryUsage(raw).percent).toBe(0);
  });
});

describe("computeNetworkIO", () => {
  it("when multiple interfaces are reported — sums rx_bytes and tx_bytes", () => {
    const raw = makeRawStats({
      networks: {
        eth0: { rx_bytes: 1000, tx_bytes: 2000 },
        eth1: { rx_bytes: 500, tx_bytes: 700 },
      },
    });

    expect(computeNetworkIO(raw)).toEqual({ rx: 1500, tx: 2700 });
  });

  it("when networks field is undefined — returns zeros", () => {
    const raw = makeRawStats({ networks: undefined });

    expect(computeNetworkIO(raw)).toEqual({ rx: 0, tx: 0 });
  });
});

describe("computeBlockIO", () => {
  it("when io_service_bytes_recursive contains Read and Write ops — sums separately", () => {
    const raw = makeRawStats({
      blkio_stats: {
        io_service_bytes_recursive: [
          { op: "Read", value: 1000 },
          { op: "Write", value: 2000 },
          { op: "Read", value: 500 },
          { op: "Sync", value: 9999 },
        ],
      },
    });

    expect(computeBlockIO(raw)).toEqual({ read: 1500, write: 2000 });
  });

  it("when io_service_bytes_recursive is empty — returns zeros", () => {
    const raw = makeRawStats({
      blkio_stats: { io_service_bytes_recursive: [] },
    });

    expect(computeBlockIO(raw)).toEqual({ read: 0, write: 0 });
  });
});

describe("normalizeStats", () => {
  it("when given a realistic raw payload and meta — returns a populated ContainerStats", () => {
    const raw = makeRawStats();
    const id = faker.string.hexadecimal({ length: 12, prefix: "" });
    const name = faker.word.noun();

    const stats = normalizeStats(raw, { id, name, state: "running" });

    expect(stats).toMatchObject({
      id,
      name,
      state: "running",
      memory: { used: 90_000_000, limit: 1_000_000_000 },
      network: { rx: 1000, tx: 2000 },
      block: { read: 4096, write: 8192 },
      pids: 7,
      read: raw.read,
    });
  });
});

describe("aggregateOverview", () => {
  it("when given multiple running containers — sums CPU%, memory, net, block across them", () => {
    const a = makeContainerStats({
      cpuPercent: 10,
      memory: { used: 100, limit: 1000, percent: 10 },
      network: { rx: 1, tx: 2 },
      block: { read: 3, write: 4 },
    });
    const b = makeContainerStats({
      cpuPercent: 25,
      memory: { used: 200, limit: 2000, percent: 10 },
      network: { rx: 10, tx: 20 },
      block: { read: 30, write: 40 },
    });

    const overview = aggregateOverview([a, b], {
      running: 2,
      stopped: 1,
      total: 3,
    });

    expect(overview.totals).toEqual({
      cpuPercent: 35,
      memory: { used: 300, limit: 3000 },
      network: { rx: 11, tx: 22 },
      block: { read: 33, write: 44 },
    });
  });

  it("when given zero containers — totals are all zero", () => {
    const overview = aggregateOverview([], {
      running: 0,
      stopped: 0,
      total: 0,
    });

    expect(overview.totals).toEqual({
      cpuPercent: 0,
      memory: { used: 0, limit: 0 },
      network: { rx: 0, tx: 0 },
      block: { read: 0, write: 0 },
    });
  });
});

describe("getContainerStatsSnapshot", () => {
  it("when docker returns a raw payload — normalizes with the provided meta", async () => {
    const raw = makeRawStats();
    mockContainer.stats.mockResolvedValue(raw);
    const id = faker.string.hexadecimal({ length: 12, prefix: "" });
    const name = faker.word.noun();

    const stats = await getContainerStatsSnapshot(id, {
      name,
      state: "running",
    });

    expect(stats).toMatchObject({ id, name, state: "running" });
  });

  it("when requesting a snapshot — passes stream: false to docker", async () => {
    mockContainer.stats.mockResolvedValue(makeRawStats());

    await getContainerStatsSnapshot("abc", { name: "n", state: "running" });

    expect(mockContainer.stats).toHaveBeenCalledWith({ stream: false });
  });
});

describe("getOverview", () => {
  it("when one running and one stopped container exist — counts correctly and snapshots only the running one", async () => {
    mockDocker.listContainers.mockResolvedValue([
      { Id: "run-1", Names: ["/alpha"], State: "running" },
      { Id: "stop-1", Names: ["/beta"], State: "exited" },
    ]);
    mockContainer.stats.mockResolvedValue(makeRawStats());

    const overview = await getOverview();

    expect(overview.counts).toEqual({ running: 1, stopped: 1, total: 2 });
  });

  it("when a snapshot call fails — omits that container but keeps others", async () => {
    mockDocker.listContainers.mockResolvedValue([
      { Id: "good", Names: ["/good"], State: "running" },
      { Id: "bad", Names: ["/bad"], State: "running" },
    ]);
    mockContainer.stats
      .mockResolvedValueOnce(makeRawStats())
      .mockRejectedValueOnce(new Error("boom"));

    const overview = await getOverview();

    expect(overview.containers).toHaveLength(1);
  });

  it("when no containers are running — totals are zero", async () => {
    mockDocker.listContainers.mockResolvedValue([
      { Id: "s", Names: ["/s"], State: "exited" },
    ]);

    const overview = await getOverview();

    expect(overview.totals.cpuPercent).toBe(0);
  });
});

describe("overviewStream", () => {
  beforeEach(() => {
    mockDocker.listContainers.mockResolvedValue([
      { Id: "run-1", Names: ["/alpha"], State: "running" },
    ]);
    mockContainer.stats.mockResolvedValue(makeRawStats());
  });

  it("yields a first snapshot immediately, then again on every intervalMs tick", async () => {
    vi.useFakeTimers();
    try {
      const gen = overviewStream({ intervalMs: 1000 });

      // First snapshot resolves on its own; no timer needed.
      const first = await gen.next();
      expect(first.done).toBe(false);
      expect(JSON.parse(first.value as string).counts.running).toBe(1);

      // Each subsequent snapshot waits for the timer.
      const secondPromise = gen.next();
      await vi.advanceTimersByTimeAsync(1000);
      const second = await secondPromise;
      expect(second.done).toBe(false);
      expect(JSON.parse(second.value as string)).toBeDefined();

      await gen.return(undefined);
    } finally {
      vi.useRealTimers();
    }
  });

  it("when the consumer returns mid-sleep — gen.return() resolves without advancing the timer", async () => {
    vi.useFakeTimers();
    try {
      const gen = overviewStream({ intervalMs: 60_000 });
      await gen.next(); // pull the eager first snapshot; the generator now awaits the timer

      // Return must resolve promptly because the generator's finally block aborts
      // the in-flight sleep; if it required the 60s timer to elapse, this would hang.
      const returnResult = await gen.return(undefined);
      expect(returnResult.done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("containerStatsFrames", () => {
  function jsonFrame(overrides: Partial<RawStats> = {}): string {
    return JSON.stringify(makeRawStats(overrides));
  }

  it("when a JSON frame is split across two chunks — reassembles it into one yield", async () => {
    const frame = jsonFrame() + "\n";
    const split = Math.floor(frame.length / 2);
    const upstream = Readable.from([
      Buffer.from(frame.slice(0, split)),
      Buffer.from(frame.slice(split)),
    ]);
    mockContainer.stats.mockResolvedValue(upstream);

    const out: string[] = [];
    for await (const s of containerStatsFrames("c1", { name: "n", state: "running" })) {
      out.push(s);
    }

    expect(out).toHaveLength(1);
    const stats = JSON.parse(out[0]) as ContainerStats;
    expect(stats).toMatchObject({ id: "c1", name: "n", state: "running" });
  });

  it("when one chunk contains multiple complete frames — yields one string per frame", async () => {
    const upstream = Readable.from([
      Buffer.from(jsonFrame() + "\n" + jsonFrame() + "\n"),
    ]);
    mockContainer.stats.mockResolvedValue(upstream);

    const out: string[] = [];
    for await (const s of containerStatsFrames("c1", { name: "n", state: "running" })) {
      out.push(s);
    }

    expect(out).toHaveLength(2);
  });

  it("when a malformed line sits between two good frames — skips the bad line and keeps yielding", async () => {
    const upstream = Readable.from([
      Buffer.from(jsonFrame() + "\nnot-json\n" + jsonFrame() + "\n"),
    ]);
    mockContainer.stats.mockResolvedValue(upstream);

    const out: string[] = [];
    for await (const s of containerStatsFrames("c1", { name: "n", state: "running" })) {
      out.push(s);
    }

    expect(out).toHaveLength(2);
  });

  it("when the consumer returns early — destroys the upstream dockerode stream", async () => {
    const upstream = Readable.from([
      Buffer.from(jsonFrame() + "\n" + jsonFrame() + "\n"),
    ]);
    mockContainer.stats.mockResolvedValue(upstream);

    const gen = containerStatsFrames("c1", { name: "n", state: "running" });
    await gen.next(); // pull one frame, then bail
    await gen.return(undefined);

    expect(upstream.destroyed).toBe(true);
  });
});
