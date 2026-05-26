import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/docker/client", () => ({
  getDocker: () => globalThis.__testDocker!,
}));

vi.mock("@/lib/docker/containers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/docker/containers")>();
  return { ...actual, isSelfContainer: vi.fn().mockReturnValue(true) };
});

import { GET } from "./route";
import { useTestDb } from "@/test/db";
import { loginAs } from "@/test/auth";
import { buildRequest, callHandler } from "@/test/request";
import { installFakeDocker, getFakeDocker } from "@/test/docker";
import type { CreateContainerInput } from "@/lib/docker/types";

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/containers/[id]/spec", () => {
  const ctx = useTestDb();

  beforeEach(() => {
    installFakeDocker();
  });

  it("when admin requests a container's spec, returns a CreateContainerInput", async () => {
    await loginAs(ctx.get(), { role: "admin" });
    const c = await getFakeDocker().createContainer({
      name: "web",
      Image: "nginx:latest",
      Env: ["FOO=bar"],
      Hostname: "myhost",
      HostConfig: {
        Binds: ["/srv/data:/data:rw"],
        RestartPolicy: { Name: "always", MaximumRetryCount: 0 },
      },
    });

    const res = await callHandler<CreateContainerInput>(GET, buildRequest(), params(c.id));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: "web",
      image: "nginx:latest",
      env: ["FOO=bar"],
      hostname: "myhost",
      volumes: [{ containerPath: "/data", mode: "rw" }],
      restartPolicy: { name: "always", maximumRetryCount: 0 },
    });
  });

  it("when a non-admin user targets the self container, returns 403", async () => {
    await loginAs(ctx.get(), { role: "user" });
    const c = await getFakeDocker().createContainer({ name: "app", Image: "node" });

    const res = await callHandler(GET, buildRequest(), params(c.id));

    expect(res.status).toBe(403);
  });
});
