/** Best-effort destroy of a dockerode stream. Dockerode's `getEvents`,
 *  `container.logs`, and `docker.pull` all return values typed loosely
 *  enough that `destroy` lives off the public type. This helper hides
 *  the cast and the runtime check in one place. */
export function destroyStream(stream: unknown): void {
  if (
    stream &&
    typeof stream === "object" &&
    "destroy" in stream &&
    typeof (stream as { destroy?: unknown }).destroy === "function"
  ) {
    (stream as { destroy: () => void }).destroy();
  }
}
