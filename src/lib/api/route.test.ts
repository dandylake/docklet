import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod/v4";

vi.mock("@/lib/auth/middleware", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/auth/middleware")
  >("@/lib/auth/middleware");
  return {
    ...actual,
    requireAuth: vi.fn(),
    requireRole: vi.fn(),
  };
});

import {
  requireAuth,
  requireRole,
  AuthError,
} from "@/lib/auth/middleware";
import { AppError } from "@/lib/errors";
import {
  apiRoute,
  jsonRoute,
  multipartRoute,
  binaryRoute,
} from "./route";
import { buildRequest, callHandler } from "@/test/request";

const session = { userId: 1, username: "alice", role: "admin" };

beforeEach(() => {
  vi.mocked(requireAuth).mockReset();
  vi.mocked(requireRole).mockReset();
});

describe("apiRoute — auth resolution", () => {
  it("when auth is 'none' — session is null and no auth fn is called", async () => {
    let received: { session: unknown } | undefined;
    const route = apiRoute({
      auth: "none",
      handler: async (ctx) => {
        received = { session: ctx.session };
        return new Response("ok");
      },
    });

    const res = await callHandler(route, buildRequest());

    expect(res.status).toBe(200);
    expect(received?.session).toBeNull();
    expect(requireAuth).not.toHaveBeenCalled();
    expect(requireRole).not.toHaveBeenCalled();
  });

  it("when auth is 'authed' — calls requireAuth and passes the session", async () => {
    vi.mocked(requireAuth).mockResolvedValue(session);
    let receivedSession: unknown;
    const route = apiRoute({
      auth: "authed",
      handler: async (ctx) => {
        receivedSession = ctx.session;
        return new Response("ok");
      },
    });

    await callHandler(route, buildRequest());

    expect(requireAuth).toHaveBeenCalledOnce();
    expect(receivedSession).toEqual(session);
  });

  it("when auth is a role string — calls requireRole with that role", async () => {
    vi.mocked(requireRole).mockResolvedValue(session);
    const route = apiRoute({ auth: "admin", handler: async () => new Response("ok") });

    await callHandler(route, buildRequest());

    expect(requireRole).toHaveBeenCalledWith("admin");
  });

  it("when auth is a role array — spreads it into requireRole", async () => {
    vi.mocked(requireRole).mockResolvedValue(session);
    const route = apiRoute({
      auth: ["admin", "mod"],
      handler: async () => new Response("ok"),
    });

    await callHandler(route, buildRequest());

    expect(requireRole).toHaveBeenCalledWith("admin", "mod");
  });

  it("when auth is a callable — invokes it with params and uses its session", async () => {
    const customAuth = vi.fn(async () => session);
    let received: { session: unknown; params: unknown } | undefined;
    const route = apiRoute<{ id: string }>({
      auth: customAuth,
      handler: async (ctx) => {
        received = { session: ctx.session, params: ctx.params };
        return new Response("ok");
      },
    });

    await callHandler(route, buildRequest(), { params: Promise.resolve({ id: "c-123" }) });

    expect(customAuth).toHaveBeenCalledWith({ params: { id: "c-123" } });
    expect(received?.session).toEqual(session);
    expect(received?.params).toEqual({ id: "c-123" });
  });

  it("when auth throws AuthError — handleApiError translates to the right status", async () => {
    vi.mocked(requireRole).mockRejectedValue(new AuthError("Forbidden", 403));
    const handler = vi.fn();
    const route = apiRoute({ auth: "admin", handler });

    const res = await callHandler(route, buildRequest());

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Forbidden" });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("apiRoute — error handling", () => {
  it("when handler throws AppError — surfaces status and message", async () => {
    vi.mocked(requireAuth).mockResolvedValue(session);
    const route = apiRoute({
      auth: "authed",
      handler: async () => {
        throw new AppError(404, "Not found");
      },
    });

    const res = await callHandler(route, buildRequest());

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });

  it("when handler throws an unexpected error — returns 500 internal server error", async () => {
    vi.mocked(requireAuth).mockResolvedValue(session);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const route = apiRoute({
      auth: "authed",
      handler: async () => {
        throw new Error("boom");
      },
    });

    const res = await callHandler(route, buildRequest());

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Internal server error" });
    errorSpy.mockRestore();
  });
});

describe("jsonRoute — body validation", () => {
  const bodySchema = z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
  });

  it("when body matches schema — handler receives parsed body", async () => {
    const handler = vi.fn(async ({ body }) => ({ echoed: body }));
    const route = jsonRoute({
      auth: "none",
      body: bodySchema,
      handler,
    });

    const res = await callHandler(
      route,
      buildRequest({ method: "POST", body: { name: "x", age: 5 } }),
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ echoed: { name: "x", age: 5 } });
  });

  it("when body fails schema — returns 400 with the first issue message", async () => {
    const route = jsonRoute({
      auth: "none",
      body: bodySchema,
      handler: async () => ({ ok: true }),
    });

    const res = await callHandler(
      route,
      buildRequest({ method: "POST", body: { age: -1 } }),
    );

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/name|string/i);
  });

  it("when body is invalid JSON — returns 400 (schema sees undefined)", async () => {
    const route = jsonRoute({
      auth: "none",
      body: z.object({ a: z.string() }),
      handler: async () => ({ ok: true }),
    });

    const res = await callHandler(
      route,
      buildRequest({
        method: "POST",
        body: "not-json{",
        headers: { "content-type": "application/json" },
      }),
    );

    expect(res.status).toBe(400);
  });

  it("when no body schema is given — handler receives undefined body", async () => {
    let receivedBody: unknown = "sentinel";
    const route = jsonRoute({
      auth: "none",
      handler: ({ body }) => {
        receivedBody = body;
        return { body };
      },
    });

    const res = await callHandler(route, buildRequest());

    expect(res.status).toBe(200);
    expect(receivedBody).toBeUndefined();
  });
});

describe("jsonRoute — query validation", () => {
  it("when query matches schema — handler receives parsed query", async () => {
    const handler = vi.fn(async ({ query }) => ({ q: query }));
    const route = jsonRoute({
      auth: "none",
      query: z.object({
        force: z
          .string()
          .optional()
          .transform((v) => v === "true"),
      }),
      handler,
    });

    const res = await callHandler(
      route,
      buildRequest({ url: "http://localhost/api?force=true" }),
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ q: { force: true } });
  });

  it("when query fails schema — returns 400", async () => {
    const route = jsonRoute({
      auth: "none",
      query: z.object({ page: z.string().regex(/^\d+$/) }),
      handler: async () => ({ ok: true }),
    });

    const res = await callHandler(
      route,
      buildRequest({ url: "http://localhost/api?page=abc" }),
    );

    expect(res.status).toBe(400);
  });
});

describe("jsonRoute — response wrapping", () => {
  it("defaults to status 200", async () => {
    const route = jsonRoute({
      auth: "none",
      handler: async () => ({ ok: true }),
    });

    const res = await callHandler(route, buildRequest());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("honors a custom status", async () => {
    const route = jsonRoute({
      auth: "none",
      status: 201,
      handler: async () => ({ id: 7 }),
    });

    const res = await callHandler(
      route,
      buildRequest({ method: "POST", body: {} }),
    );

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 7 });
  });

  it("passes params from Next's context to the handler", async () => {
    const handler = vi.fn(async ({ params }) => ({ params }));
    const route = jsonRoute<{ id: string }>({
      auth: "none",
      handler,
    });

    const res = await callHandler(route, buildRequest(), {
      params: Promise.resolve({ id: "abc" }),
    });

    expect(res.body).toEqual({ params: { id: "abc" } });
  });
});

describe("multipartRoute", () => {
  it("passes parsed FormData to the handler", async () => {
    const handler = vi.fn(async ({ formData }) => ({
      name: formData.get("name"),
    }));
    const route = multipartRoute({ auth: "none", handler });

    const form = new FormData();
    form.set("name", "hello");
    const req = new (await import("next/server")).NextRequest(
      new URL("http://localhost/api"),
      { method: "POST", body: form },
    );

    const res = await callHandler(route, req);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: "hello" });
  });
});

describe("binaryRoute", () => {
  it("returns a Response built from body + headers", async () => {
    const route = binaryRoute({
      auth: "none",
      handler: async () => ({
        body: "binary-payload",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": 'attachment; filename="x.bin"',
        },
      }),
    });

    const res = await callHandler(route, buildRequest());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="x.bin"',
    );
    expect(res.body).toBe("binary-payload");
  });

  it("honors a custom status", async () => {
    const route = binaryRoute({
      auth: "none",
      handler: async () => ({
        body: "",
        headers: {},
        status: 206,
      }),
    });

    const res = await callHandler(route, buildRequest());

    expect(res.status).toBe(206);
  });
});
