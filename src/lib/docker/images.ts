import { getDocker } from "./client";
import { destroyStream } from "./stream-utils";
import type { ImageSummary, PullProgress } from "./types";

export async function listImages(): Promise<ImageSummary[]> {
  const docker = getDocker();
  const images = await docker.listImages();
  return images
    .filter((img) => {
      const tags = img.RepoTags ?? [];
      return tags.length > 0 && tags[0] !== "<none>:<none>";
    })
    .map((img) => ({
      id: img.Id,
      repoTags: img.RepoTags ?? [],
      size: img.Size,
      created: img.Created,
    }));
}

export async function removeImage(
  id: string,
  force = false
): Promise<void> {
  const docker = getDocker();
  await docker.getImage(id).remove({ force });
}

export function parsePullProgress(line: string): PullProgress | null {
  try {
    return JSON.parse(line) as PullProgress;
  } catch {
    return null;
  }
}

/** Yields the JSON progress lines emitted by `docker pull`, terminating
 *  with `{"complete":true}` on success or `{"error":"<message>"}` on
 *  failure. Frontend reads the terminator to know when to close the
 *  progress UI. The upstream stream is destroyed on consumer disconnect. */
export async function* pullImageLines(repoTag: string): AsyncGenerator<string> {
  const docker = getDocker();
  const stream = await docker.pull(repoTag);

  try {
    for await (const chunk of stream as unknown as AsyncIterable<Buffer>) {
      const text = chunk.toString("utf-8").trim();
      if (!text) continue;
      for (const line of text.split("\n")) {
        if (line) yield line; // already JSON-encoded by dockerode
      }
    }
    yield JSON.stringify({ complete: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    yield JSON.stringify({ error: message });
  } finally {
    destroyStream(stream);
  }
}
