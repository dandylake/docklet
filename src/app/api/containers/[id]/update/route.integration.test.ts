import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/docker/client", () => ({
  getDocker: () => globalThis.__testDocker!,
}));

// isSelfContainer always returns true so the non-admin guard test works.
// Admin tests are unaffected because the guard short-circuits on role check.
vi.mock("@/lib/docker/containers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/docker/containers")>();
  return { ...actual, isSelfContainer: vi.fn().mockReturnValue(true) };
});

import { PUT } from "./route";
import { useTestDb } from "@/test/db";
import { loginAs } from "@/test/auth";
import { buildRequest, callHandler } from "@/test/request";
import { installFakeDocker, getFakeDocker } from "@/test/docker";

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

const validBody = { name: "updated", image: "nginx:latest" };

describe("PUT /api/containers/[id]/update", () => {
  const ctx = useTestDb();

  beforeEach(() => {
    installFakeDocker();
  });

  describe("happy path", () => {
    it("when admin updates a container, replaces it and returns the new id", async () => {
      await loginAs(ctx.get(), { role: "admin" });
      const fake = getFakeDocker();
      const original = await fake.createContainer({ name: "web", Image: "nginx" });

      const res = await callHandler<{ id: string }>(
        PUT,
        buildRequest({ method: "PUT", body: validBody }),
        params(original.id)
      );

      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();
      expect(res.body.id).not.toBe(original.id);
      const containers = getFakeDocker().getContainers();
      expect(containers).toHaveLength(1);
      expect(containers[0].name).toBe("updated");
    });
  });

  describe("validation", () => {
    it("when the request body is missing the required name field — returns 400 with the validation error", async () => {
      await loginAs(ctx.get(), { role: "admin" });
      const fake = getFakeDocker();
      const c = await fake.createContainer({ name: "x", Image: "alpine" });

      const res = await callHandler<{ error: string }>(
        PUT,
        buildRequest({ method: "PUT", body: { image: "nginx:latest" } }),
        params(c.id)
      );

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/name/i);
    });
  });

  describe("authorization", () => {
    it("when a non-admin user targets the self container, returns 403", async () => {
      await loginAs(ctx.get(), { role: "user" });
      const fake = getFakeDocker();
      const c = await fake.createContainer({ name: "app", Image: "node" });

      const res = await callHandler(PUT, buildRequest({ method: "PUT", body: validBody }), params(c.id));

      expect(res.status).toBe(403);
    });
  });
});
