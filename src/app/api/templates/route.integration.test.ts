import { describe, it, expect } from "vitest";
import { GET, POST } from "./route";
import { useTestDb } from "@/test/db";
import { loginAs } from "@/test/auth";
import { buildRequest, callHandler } from "@/test/request";
import { faker } from "@faker-js/faker";

describe("/api/templates (collection)", () => {
  const ctx = useTestDb();

  describe("GET", () => {
    it("when logged in, returns all templates", async () => {
      await loginAs(ctx.get(), { role: "user" });
      // Seed two templates via POST to avoid coupling to schema details
      await callHandler(POST, buildRequest({ method: "POST", body: { name: "nginx", config: { image: "nginx:latest" } } }));
      await callHandler(POST, buildRequest({ method: "POST", body: { name: "redis", config: { image: "redis:7" } } }));

      const res = await callHandler<Array<{ name: string }>>(
        GET,
        buildRequest()
      );

      expect(res.status).toBe(200);
      expect(res.body.map((t) => t.name).sort()).toEqual(["nginx", "redis"]);
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
    it("when input is valid, persists the template with createdBy set to the caller", async () => {
      const me = await loginAs(ctx.get(), { role: "user" });
      const name = `tpl-${faker.string.alphanumeric(6)}`;

      const res = await callHandler<{ id: number; name: string; createdBy: number; config: string }>(
        POST,
        buildRequest({ method: "POST", body: { name, config: { image: "alpine" } } })
      );

      expect(res.status).toBe(201);
      expect(res.body.name).toBe(name);
      expect(res.body.createdBy).toBe(me.id);
      expect(JSON.parse(res.body.config)).toEqual({ image: "alpine" });
    });

    it("when name is empty — returns 400 with the validation error", async () => {
      await loginAs(ctx.get(), { role: "user" });

      const res = await callHandler<{ error: string }>(
        POST,
        buildRequest({ method: "POST", body: { name: "", config: {} } })
      );

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/name/i);
    });

    it("when not logged in, returns 401", async () => {
      const res = await callHandler(
        POST,
        buildRequest({ method: "POST", body: { name: "x", config: {} } })
      );
      expect(res.status).toBe(401);
    });
  });
});
