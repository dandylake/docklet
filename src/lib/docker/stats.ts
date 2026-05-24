import type Dockerode from "dockerode";
import { getDocker } from "./client";
import { destroyStream } from "./stream-utils";

export interface RawStats {
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
    usage?: number;
    limit?: number;
    stats?: { cache?: number; inactive_file?: number };
  };
  networks?: Record<string, { rx_bytes: number; tx_bytes: number }>;
  blkio_stats?: {
    io_service_bytes_recursive?: Array<{ op: string; value: number }>;
  };
  pids_stats?: { current?: number };
}

export interface ContainerStats {
  id: string;
  name: string;
  state: string;
  cpuPercent: number;
  memory: { used: number; limit: number; percent: number };
  network: { rx: number; tx: number };
  block: { read: number; write: number };
  pids: number;
  read: string;
}

export interface OverviewTotals {
  cpuPercent: number;
  memory: { used: number; limit: number };
  network: { rx: number; tx: number };
  block: { read: number; write: number };
}

export interface DockerOverview {
  containers: ContainerStats[];
  counts: { running: number; stopped: number; total: number };
  totals: OverviewTotals;
}

export function computeCpuPercent(raw: RawStats): number {
  const cpuDelta =
    (raw.cpu_stats.cpu_usage.total_usage ?? 0) -
    (raw.precpu_stats.cpu_usage.total_usage ?? 0);
  const systemDelta =
    (raw.cpu_stats.system_cpu_usage ?? 0) -
    (raw.precpu_stats.system_cpu_usage ?? 0);
  if (!(systemDelta > 0) || !(cpuDelta > 0)) return 0;

  const onlineCpus =
    raw.cpu_stats.online_cpus ??
    raw.cpu_stats.cpu_usage.percpu_usage?.length ??
    0;
  if (!(onlineCpus > 0)) return 0;

  const pct = (cpuDelta / systemDelta) * onlineCpus * 100;
  return Number.isFinite(pct) ? pct : 0;
}

export function computeMemoryUsage(
  raw: RawStats
): { used: number; limit: number; percent: number } {
  const rawUsage = raw.memory_stats.usage ?? 0;
  const cache =
    raw.memory_stats.stats?.cache ??
    raw.memory_stats.stats?.inactive_file ??
    0;
  const used = Math.max(rawUsage - cache, 0);
  const limit = raw.memory_stats.limit ?? 0;
  const percent = limit > 0 ? (used / limit) * 100 : 0;
  return { used, limit, percent };
}

export function computeNetworkIO(raw: RawStats): { rx: number; tx: number } {
  const nets = raw.networks;
  if (!nets) return { rx: 0, tx: 0 };
  let rx = 0;
  let tx = 0;
  for (const iface of Object.values(nets)) {
    rx += iface.rx_bytes ?? 0;
    tx += iface.tx_bytes ?? 0;
  }
  return { rx, tx };
}

export function computeBlockIO(
  raw: RawStats
): { read: number; write: number } {
  const entries = raw.blkio_stats?.io_service_bytes_recursive ?? [];
  let read = 0;
  let write = 0;
  for (const e of entries) {
    if (e.op === "Read") read += e.value ?? 0;
    else if (e.op === "Write") write += e.value ?? 0;
  }
  return { read, write };
}

export function normalizeStats(
  raw: RawStats,
  meta: { id: string; name: string; state: string }
): ContainerStats {
  return {
    id: meta.id,
    name: meta.name,
    state: meta.state,
    cpuPercent: computeCpuPercent(raw),
    memory: computeMemoryUsage(raw),
    network: computeNetworkIO(raw),
    block: computeBlockIO(raw),
    pids: raw.pids_stats?.current ?? 0,
    read: raw.read,
  };
}

export function aggregateOverview(
  containers: ContainerStats[],
  counts: { running: number; stopped: number; total: number }
): DockerOverview {
  const totals: OverviewTotals = {
    cpuPercent: 0,
    memory: { used: 0, limit: 0 },
    network: { rx: 0, tx: 0 },
    block: { read: 0, write: 0 },
  };
  for (const c of containers) {
    totals.cpuPercent += c.cpuPercent;
    totals.memory.used += c.memory.used;
    totals.memory.limit += c.memory.limit;
    totals.network.rx += c.network.rx;
    totals.network.tx += c.network.tx;
    totals.block.read += c.block.read;
    totals.block.write += c.block.write;
  }
  return { containers, counts, totals };
}

export async function getContainerStatsSnapshot(
  id: string,
  meta: { name: string; state: string }
): Promise<ContainerStats> {
  const docker = getDocker();
  const container = docker.getContainer(id);
  const raw = (await container.stats({
    stream: false,
  })) as unknown as RawStats;
  return normalizeStats(raw, { id, name: meta.name, state: meta.state });
}

export async function getOverview(): Promise<DockerOverview> {
  const docker = getDocker();
  const list = (await docker.listContainers({
    all: true,
  })) as Dockerode.ContainerInfo[];

  let running = 0;
  let stopped = 0;
  const runningMeta: Array<{ id: string; name: string; state: string }> = [];
  for (const c of list) {
    if (c.State === "running") {
      running++;
      runningMeta.push({
        id: c.Id,
        name: (c.Names[0] ?? "").replace(/^\//, ""),
        state: c.State,
      });
    } else {
      stopped++;
    }
  }
  const counts = { running, stopped, total: list.length };

  const results = await Promise.allSettled(
    runningMeta.map((m) =>
      getContainerStatsSnapshot(m.id, { name: m.name, state: m.state })
    )
  );

  const containers: ContainerStats[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") containers.push(r.value);
  }

  return aggregateOverview(containers, counts);
}

export async function streamContainerStats(
  id: string
): Promise<NodeJS.ReadableStream> {
  const docker = getDocker();
  const container = docker.getContainer(id);
  return (await container.stats({
    stream: true,
  })) as unknown as NodeJS.ReadableStream;
}

/** Yields normalized ContainerStats as JSON strings, one per docker
 *  stats frame. Buffers across chunk boundaries since docker may split
 *  a frame mid-line. Malformed frames are skipped silently. The
 *  upstream dockerode stream is destroyed when the consumer
 *  disconnects (the iterator's finally runs on `return()`). */
export async function* containerStatsFrames(
  id: string,
  meta: { name: string; state: string }
): AsyncGenerator<string> {
  const stream = await streamContainerStats(id);
  let buffer = "";

  try {
    for await (const chunk of stream as unknown as AsyncIterable<Buffer>) {
      buffer += chunk.toString("utf-8");
      let nl = buffer.indexOf("\n");
      while (nl !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.trim()) {
          try {
            const raw = JSON.parse(line) as RawStats;
            const stats = normalizeStats(raw, {
              id,
              name: meta.name,
              state: meta.state,
            });
            yield JSON.stringify(stats);
          } catch {
            // Skip malformed frame.
          }
        }
        nl = buffer.indexOf("\n");
      }
    }
  } finally {
    destroyStream(stream);
  }
}

/** Yields snapshots of `getOverview()` as JSON strings, starting
 *  immediately and then on every `intervalMs` tick. Per-tick failures are
 *  swallowed so a transient probe error doesn't break the stream; the
 *  next tick will retry. Iterator return aborts the in-flight sleep so
 *  the generator can clean up promptly. */
export async function* overviewStream(
  opts: { intervalMs: number }
): AsyncGenerator<string> {
  const { intervalMs } = opts;
  const abort = new AbortController();

  try {
    while (!abort.signal.aborted) {
      try {
        const snapshot = await getOverview();
        yield JSON.stringify(snapshot);
      } catch {
        // Skip this tick; the next one will retry.
      }
      if (abort.signal.aborted) break;
      await sleep(intervalMs, abort.signal);
    }
  } finally {
    abort.abort();
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
