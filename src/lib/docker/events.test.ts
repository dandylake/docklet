import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "stream";

const mockGetEvents = vi.fn();

vi.mock("./client", () => ({
  getDocker: () => ({ getEvents: mockGetEvents }),
}));

import { containerEventStream } from "./events";

/** Wrap a sequence of JSON strings as a dockerode-style readable. Each item
 *  becomes one chunk on the stream; that matches how the docker daemon emits
 *  events (one newline-delimited JSON object per push). */
function fakeEventStream(frames: string[]): Readable {
  return Readable.from(frames.map((f) => Buffer.from(f, "utf-8")));
}

async function collect(gen: AsyncGenerator<string>, max = 100): Promise<string[]> {
  const out: string[] = [];
  for await (const value of gen) {
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("containerEventStream", () => {
  it("filters dockerode events for container lifecycle actions", async () => {
    mockGetEvents.mockResolvedValue(fakeEventStream([]));
    await collect(containerEventStream());

    expect(mockGetEvents).toHaveBeenCalledWith({
      filters: {
        type: ["container"],
        event: ["start", "stop", "die", "destroy", "create", "pause", "unpause"],
      },
    });
  });

  it("maps dockerode event payload to the DockerEvent shape", async () => {
    mockGetEvents.mockResolvedValue(
      fakeEventStream([
        JSON.stringify({
          Action: "start",
          id: "abc123",
          Actor: { Attributes: { name: "nginx" } },
          time: 1_700_000_000,
        }),
      ])
    );

    const [out] = await collect(containerEventStream());
    expect(JSON.parse(out)).toEqual({
      action: "start",
      id: "abc123",
      name: "nginx",
      time: 1_700_000_000,
    });
  });

  it("when fields are missing — defaults action and name to empty and time to 0", async () => {
    mockGetEvents.mockResolvedValue(fakeEventStream([JSON.stringify({ id: "only-id" })]));

    const [out] = await collect(containerEventStream());
    expect(JSON.parse(out)).toEqual({ action: "", id: "only-id", name: "", time: 0 });
  });

  it("when a frame is malformed JSON — skips it and continues", async () => {
    mockGetEvents.mockResolvedValue(
      fakeEventStream([
        "not-json",
        JSON.stringify({ Action: "stop", id: "x", time: 1 }),
      ])
    );

    const events = await collect(containerEventStream());
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0])).toMatchObject({ action: "stop", id: "x" });
  });

  it("when the consumer stops iterating — destroys the upstream stream", async () => {
    const upstream = fakeEventStream([
      JSON.stringify({ Action: "start", id: "a", time: 1 }),
      JSON.stringify({ Action: "stop", id: "a", time: 2 }),
    ]);
    const destroySpy = vi.spyOn(upstream, "destroy");
    mockGetEvents.mockResolvedValue(upstream);

    const gen = containerEventStream();
    await gen.next(); // pull one frame, then bail out
    await gen.return(undefined);

    expect(destroySpy).toHaveBeenCalled();
  });
});
