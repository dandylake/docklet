import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/docker/client", () => ({
  getDocker: () => globalThis.__testDocker!,
}));

import { GET, DELETE } from "./route";
import { POST as startPost } from "./start/route";
import { POST as stopPost } from "./stop/route";
import { POST as restartPost } from "./restart/route";
import { useTestDb } from "@/test/db";
import { loginAs } from "@/test/auth";
import { buildRequest, callHandler } from "@/test/request";
import { installFakeDocker, getFakeDocker } from "@/test/docker";

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function seedContainer(name: string, image: string) {
  const fake = getFakeDocker();
  const c = await fake.createContainer({ name, Image: image });
  return c.id;
}

describe("/api/containers/[id]", () => {
  const ctx = useTestDb();

  beforeEach(() => {
    installFakeDocker();
  });

  describe("GET", () => {
    it("when the container exists, returns its inspect info", async () => {
      await loginAs(ctx.get(), { role: "admin" });
      const id = await seedContainer("web", "nginx");

      const res = await callHandler<{ name: string; image: string }>(
        GET,
        buildRequest(),
        params(id)
      );

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: "web", image: "nginx" });
    });

    it("when the container has bind mounts, returns them in inspect info", async () => {
      await loginAs(ctx.get(), { role: "admin" });
      const c = await getFakeDocker().createContainer({
        name: "with-vol",
        Image: "nginx",
        HostConfig: { Binds: ["/srv/data:/data:rw"] },
      });

      const res = await callHandler<{ mounts: Array<Record<string, unknown>> }>(
        GET,
        buildRequest(),
        params(c.id)
      );

      expect(res.status).toBe(200);
      expect(res.body.mounts).toEqual([
        { source: "/srv/data", destination: "/data", mode: "rw", rw: true },
      ]);
    });
  });

  describe("DELETE", () => {
    it("when called as admin, removes the container", async () => {
      await loginAs(ctx.get(), { role: "admin" });
      const id = await seedContainer("doomed", "alpine");

      const res = await callHandler(DELETE, buildRequest({ method: "DELETE" }), params(id));

      expect(res.status).toBe(200);
      expect(getFakeDocker().getContainers()).toHaveLength(0);
    });
  });

  describe("lifecycle transitions", () => {
    it("start, stop, and restart move the container through running/exited/running", async () => {
      await loginAs(ctx.get(), { role: "admin" });
      const id = await seedContainer("lc", "nginx");

      await callHandler(startPost, buildRequest({ method: "POST" }), params(id));
      expect(getFakeDocker().getContainers()[0].state).toBe("running");

      await callHandler(stopPost, buildRequest({ method: "POST" }), params(id));
      expect(getFakeDocker().getContainers()[0].state).toBe("exited");

      await callHandler(restartPost, buildRequest({ method: "POST" }), params(id));
      expect(getFakeDocker().getContainers()[0].state).toBe("running");
    });
  });
});
