import { getDocker } from "./client";
import { destroyStream } from "./stream-utils";
import type { DockerEvent } from "./types";

/** Yields container lifecycle events as JSON strings suitable for SSE.
 *  Filters down to the state transitions the UI reacts to. Malformed
 *  frames are skipped silently. The underlying dockerode stream is
 *  destroyed when the iterator returns (consumer disconnect). */
export async function* containerEventStream(): AsyncGenerator<string> {
  const docker = getDocker();
  const stream = await docker.getEvents({
    filters: {
      type: ["container"],
      event: ["start", "stop", "die", "destroy", "create", "pause", "unpause"],
    },
  });

  try {
    for await (const chunk of stream as unknown as AsyncIterable<Buffer>) {
      const raw = chunk.toString("utf-8");
      let parsed: { Action?: string; id?: string; Actor?: { Attributes?: { name?: string } }; time?: number };
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      const event: DockerEvent = {
        action: parsed.Action ?? "",
        id: parsed.id ?? "",
        name: parsed.Actor?.Attributes?.name ?? "",
        time: parsed.time ?? 0,
      };
      yield JSON.stringify(event);
    }
  } finally {
    destroyStream(stream);
  }
}
