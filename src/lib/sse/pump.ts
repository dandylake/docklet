/**
 * Convert an async iterable of pre-encoded payloads into a
 * `text/event-stream` Response.
 *
 * Invariants:
 *  - Each yielded string becomes one `data: <string>\n\n` frame.
 *  - `heartbeatMs` (if set) writes `: heartbeat\n\n` on an interval to
 *    keep proxies and EventSource clients happy.
 *  - On consumer disconnect the iterator's `return()` is called, so
 *    generators can release resources (e.g. destroy underlying Node
 *    streams) in their `finally` block.
 *  - Errors thrown by the source close the stream silently. Sources
 *    that want to signal failure to the client must yield a terminator
 *    frame (e.g. `{"error":"<message>"}`) before throwing or returning;
 *    `pumpToSSE` does not invent one.
 */
export function pumpToSSE(
  source: AsyncIterable<string>,
  opts: { heartbeatMs?: number } = {},
): Response {
  const { heartbeatMs } = opts;
  const encoder = new TextEncoder();
  const iterator = source[Symbol.asyncIterator]();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stopHeartbeat = () => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const safeEnqueue = (bytes: Uint8Array): boolean => {
        if (closed) return false;
        try {
          controller.enqueue(bytes);
          return true;
        } catch {
          closed = true;
          return false;
        }
      };

      if (heartbeatMs && heartbeatMs > 0) {
        heartbeat = setInterval(() => {
          safeEnqueue(encoder.encode(": heartbeat\n\n"));
        }, heartbeatMs);
      }

      // Drive the source in the background so start() resolves immediately;
      // otherwise an infinite source would block reads from the consumer.
      void (async () => {
        try {
          while (true) {
            const next = await iterator.next();
            if (next.done) break;
            if (!safeEnqueue(encoder.encode(`data: ${next.value}\n\n`))) break;
          }
        } catch {
          // Source error closes the stream silently.
        } finally {
          stopHeartbeat();
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch {
              // Already closed (e.g. consumer cancelled mid-iteration).
            }
          }
        }
      })();
    },
    async cancel() {
      closed = true;
      stopHeartbeat();
      // Signal generators to release resources via their finally block.
      try {
        await iterator.return?.();
      } catch {
        // Iterator return errors are not actionable here.
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
