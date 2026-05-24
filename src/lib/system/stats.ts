import os from "os";
import si from "systeminformation";
import { getDocker } from "@/lib/docker/client";

export interface SystemStats {
  cpu: { load: number; cores: number; model: string };
  mem: { used: number; total: number; free: number };
  disk: { used: number; total: number; mountpoint: string };
  uptime: number;
  os: { platform: string; distro: string; release: string };
  docker: { running: number; stopped: number; total: number; images: number };
}

export async function getSystemStats(): Promise<SystemStats> {
  const docker = getDocker();
  const [load, mem, fs, osInfo, cpuInfo, containers, images] = await Promise.all([
    si.currentLoad().catch(() => ({ currentLoad: 0 })),
    si.mem().catch(() => ({ active: 0, available: 0, total: 0, free: 0 })),
    si.fsSize().catch(() => [] as Array<{ mount: string; size: number; used: number }>),
    si.osInfo().catch(() => ({ platform: process.platform, distro: "", release: "" })),
    si.cpu().catch(() => ({ cores: os.cpus().length, manufacturer: "", brand: "" })),
    docker.listContainers({ all: true }).catch(() => []),
    docker.listImages().catch(() => []),
  ]);

  const largest = pickLargestMount(fs);
  const running = containers.filter((c) => c.State === "running").length;
  const total = containers.length;

  return {
    cpu: {
      load: round(load.currentLoad ?? 0, 1),
      cores: cpuInfo.cores ?? os.cpus().length,
      model: [cpuInfo.manufacturer, cpuInfo.brand].filter(Boolean).join(" ").trim(),
    },
    mem: {
      used: (mem.total ?? 0) - (mem.available ?? mem.free ?? 0),
      total: mem.total ?? 0,
      free: mem.available ?? mem.free ?? 0,
    },
    disk: {
      used: largest?.used ?? 0,
      total: largest?.size ?? 0,
      mountpoint: largest?.mount ?? "/",
    },
    uptime: os.uptime(),
    os: {
      platform: osInfo.platform ?? process.platform,
      distro: osInfo.distro ?? "",
      release: osInfo.release ?? "",
    },
    docker: {
      running,
      stopped: total - running,
      total,
      images: images.length,
    },
  };
}

/** Yields snapshots of `getSystemStats()` as JSON strings, starting
 *  immediately and then on every `intervalMs` tick. Per-tick failures are
 *  swallowed so a transient probe error doesn't break the stream; the
 *  next tick will retry. Iterator return aborts the in-flight sleep so
 *  the generator can clean up promptly. */
export async function* systemStatsStream(
  opts: { intervalMs: number }
): AsyncGenerator<string> {
  const { intervalMs } = opts;
  const abort = new AbortController();

  try {
    while (!abort.signal.aborted) {
      try {
        const snapshot = await getSystemStats();
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

function pickLargestMount(
  fs: Array<{ mount: string; size: number; used: number }>
): { mount: string; size: number; used: number } | undefined {
  if (!fs || fs.length === 0) return undefined;
  return fs.reduce((a, b) => (b.size > a.size ? b : a));
}

function round(n: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}
