import { describe, it, expect, vi } from "vitest";
import { destroyStream } from "./stream-utils";

describe("destroyStream", () => {
  it("calls destroy() when the input exposes one", () => {
    const destroy = vi.fn();
    destroyStream({ destroy });
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("is a no-op for anything that does not expose a destroy function", () => {
    // The runtime guard exists because dockerode hides `destroy` off the
    // public type; the helper must not throw on null, primitives, objects
    // without the method, or objects where destroy isn't a function.
    expect(() => destroyStream(null)).not.toThrow();
    expect(() => destroyStream(undefined)).not.toThrow();
    expect(() => destroyStream(42)).not.toThrow();
    expect(() => destroyStream({})).not.toThrow();
    expect(() => destroyStream({ destroy: "not-a-function" })).not.toThrow();
  });
});
