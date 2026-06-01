import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/docker/client", () => ({
  getDocker: () => globalThis.__testDocker!,
}));

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return { ...actual, mkdirSync: vi.fn() };
});

import { GET, POST } from "./route";
import { useTestDb } from "@/test/db";
import { loginAs } from "@/test/auth";
import { buildRequest, callHandler } from "@/test/request";
import { installFakeDocker, getFakeDocker } from "@/test/docker";

describe("/api/containers (collection)", () => {
  const ctx = useTestDb();

  beforeEach(() => {
    installFakeDocker();
  });

  describe("GET", () => {
    it("when logged in with running containers, returns them", async () => {
      await loginAs(ctx.get(), { role: "admin" });
      const fake = getFakeDocker();
      const c = await fake.createContainer({ name: "web", Image: "nginx" });
      await c.start();

      const res = await callHandler<Array<{ name: string; state: string }>>(
        GET,
        buildRequest()
      );

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ name: "web", state: "running" });
    });

    it("when a container publishes ports, the list includes its port bindings", async () => {
      await loginAs(ctx.get(), { role: "admin" });
      const fake = getFakeDocker();
      const c = await fake.createContainer({
        name: "web",
        Image: "nginx",
        HostConfig: {
          PortBindings: { "80/tcp": [{ HostPort: "8080", HostIp: "0.0.0.0" }] },
        },
      });
      await c.start();

      const res = await callHandler<
        Array<{ ports: Array<Record<string, unknown>> }>
      >(GET, buildRequest());

      expect(res.status).toBe(200);
      expect(res.body[0].ports).toEqual([
        { containerPort: 80, hostPort: 8080, protocol: "tcp", hostIp: "0.0.0.0" },
      ]);
    });

    it("when not logged in, returns 401", async () => {
      const res = await callHandler(
        GET,
        buildRequest()
      );
      expect(res.status).toBe(401);
    });
  });

  describe("POST", () => {
    it("when input is valid, creates and starts the container by default", async () => {
      await loginAs(ctx.get(), { role: "admin" });

      const res = await callHandler<{ id: string }>(
        POST,
        buildRequest({ method: "POST", body: { name: "nginx-1", image: "nginx:latest" } })
      );

      expect(res.status).toBe(201);
      const fake = getFakeDocker();
      const created = fake.getContainers();
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({ name: "nginx-1", image: "nginx:latest", state: "running" });
    });

    it("when autoStart is false, creates the container in state 'created'", async () => {
      await loginAs(ctx.get(), { role: "admin" });

      await callHandler(
        POST,
        buildRequest({
          method: "POST",
          body: { name: "paused", image: "redis", autoStart: false },
        })
      );

      const fake = getFakeDocker();
      expect(fake.getContainers()[0].state).toBe("created");
    });

    it("when image is missing from the body — returns 400 with the validation error", async () => {
      await loginAs(ctx.get(), { role: "admin" });

      const res = await callHandler<{ error: string }>(
        POST,
        buildRequest({ method: "POST", body: { name: "bad" } })
      );

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/image/i);
    });
  });
});
