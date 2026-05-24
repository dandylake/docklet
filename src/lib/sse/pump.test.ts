import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pumpToSSE } from "./pump";

async function readAll(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

async function* fromArray(items: string[]): AsyncGenerator<string> {
  for (const item of items) yield item;
}

/** Makes a generator that yields the seeded items, then awaits a deferred
 *  promise the test controls. Letting the test unblock the await is how
 *  we drive cancellation-induced finally cleanly under fake timers. */
function deferredSource(seed: string[]) {
  let release!: () => void;
  let cleanedUp = false;
  const blocker = new Promise<void>((r) => {
    release = r;
  });
  const gen = (async function* () {
    try {
      for (const item of seed) yield item;
      await blocker;
    } finally {
      cleanedUp = true;
    }
  })();
  return {
    gen,
    release,
    cleanedUp: () => cleanedUp,
  };
}

describe("pumpToSSE", () => {
  it("when given a finite source — frames each value as `data: <value>\\n\\n` and closes", async () => {
    const res = pumpToSSE(fromArray(["one", "two", "three"]));
    expect(await readAll(res)).toBe("data: one\n\ndata: two\n\ndata: three\n\n");
  });


  it("sets text/event-stream headers expected by EventSource consumers", () => {
    const res = pumpToSSE(fromArray([]));
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
    expect(res.headers.get("Connection")).toBe("keep-alive");
  });

  it("when source yields nothing — returns an empty, closed stream", async () => {
    const res = pumpToSSE(fromArray([]));
    expect(await readAll(res)).toBe("");
  });

  describe("with heartbeatMs under fake timers", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("emits `: heartbeat\\n\\n` on each interval tick", async () => {
      const source = deferredSource([]);
      const res = pumpToSSE(source.gen, { heartbeatMs: 30_000 });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      await vi.advanceTimersByTimeAsync(30_000);
      const first = await reader.read();
      expect(decoder.decode(first.value)).toBe(": heartbeat\n\n");

      await vi.advanceTimersByTimeAsync(30_000);
      const second = await reader.read();
      expect(decoder.decode(second.value)).toBe(": heartbeat\n\n");

      source.release();
      await reader.cancel();
    });

    it("when heartbeatMs is omitted — no frame appears after time advances", async () => {
      const source = deferredSource(["x"]);
      const res = pumpToSSE(source.gen); // no heartbeat
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      const first = await reader.read();
      expect(decoder.decode(first.value)).toBe("data: x\n\n");

      // No heartbeat configured: even after long fake time, no frame arrives.
      await vi.advanceTimersByTimeAsync(120_000);

      let received = false;
      const racing = reader.read().then((r) => {
        if (!r.done) received = true;
      });
      // Let any spuriously-queued microtasks run.
      await Promise.resolve();
      expect(received).toBe(false);

      source.release();
      await reader.cancel();
      await racing;
    });
  });

  it("when the consumer cancels — invokes the source's finally block", async () => {
    const source = deferredSource(["first"]);
    const res = pumpToSSE(source.gen);
    const reader = res.body!.getReader();

    await reader.read(); // pull "first"
    const cancelPromise = reader.cancel();
    // Unblock the generator so it can process the queued return signal.
    source.release();
    await cancelPromise;

    expect(source.cleanedUp()).toBe(true);
  });

  it("when the source throws — closes the stream without re-throwing", async () => {
    const broken = (async function* () {
      yield "before";
      throw new Error("boom");
    })();

    const res = pumpToSSE(broken);
    expect(await readAll(res)).toBe("data: before\n\n");
  });

  it("treats yielded payloads as opaque — embedded newlines pass through", async () => {
    // Sources are responsible for shaping their payload. The pump just frames.
    const res = pumpToSSE(fromArray(["line-with\nnewline"]));
    expect(await readAll(res)).toBe("data: line-with\nnewline\n\n");
  });
});
