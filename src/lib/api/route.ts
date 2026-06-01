import { NextRequest, NextResponse } from "next/server";
import type { ZodType } from "zod/v4";
import {
  requireAuth,
  requireRole,
  handleApiError,
} from "@/lib/auth/middleware";
import { AppError } from "@/lib/errors";
import type { SessionPayload } from "@/lib/auth/session";

type Role = "admin" | "mod" | "user";

export type AuthRule<P> =
  | "none"
  | "authed"
  | Role
  | ReadonlyArray<Role>
  | ((ctx: { params: P }) => Promise<SessionPayload>);

type Params = Record<string, string>;

export type NextRouteHandler<P extends Params> = (
  request: NextRequest,
  ctx: { params: Promise<P> },
) => Response | Promise<Response>;

type ApiContext<P> = {
  request: NextRequest;
  params: P;
  session: SessionPayload | null;
};

const ROLES: ReadonlyArray<Role> = ["admin", "mod", "user"];

function isRole(value: string): value is Role {
  return (ROLES as ReadonlyArray<string>).includes(value);
}

async function resolveAuth<P extends Params>(
  rule: AuthRule<P>,
  params: P,
): Promise<SessionPayload | null> {
  if (rule === "none") return null;
  if (rule === "authed") return requireAuth();
  if (typeof rule === "function") return rule({ params });
  if (typeof rule === "string") {
    if (!isRole(rule)) {
      throw new Error(`Unknown auth rule: ${rule}`);
    }
    return requireRole(rule);
  }
  return requireRole(...rule);
}

/**
 * apiRoute is the deep base for every non-SSE API route. It owns auth,
 * try/catch, and surfacing lib errors via handleApiError. The handler
 * returns a Response directly; everything bespoke (Set-Cookie, custom
 * status codes, binary bodies) lives in the handler.
 */
export function apiRoute<P extends Params = Params>(opts: {
  auth: AuthRule<P>;
  handler: (ctx: ApiContext<P>) => Response | Promise<Response>;
}): NextRouteHandler<P> {
  return async (request, ctx) => {
    try {
      const params = (ctx?.params ? await ctx.params : ({} as P)) as P;
      const session = await resolveAuth(opts.auth, params);
      return await opts.handler({ request, params, session });
    } catch (error) {
      return handleApiError(error);
    }
  };
}

async function parseSchema<T>(
  schema: ZodType<T>,
  raw: unknown,
): Promise<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const message = issue
      ? issue.path.length > 0
        ? `${issue.path.join(".")}: ${issue.message}`
        : issue.message
      : "Invalid input";
    throw new AppError(400, message);
  }
  return result.data;
}

function searchParamsToObject(request: NextRequest): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of request.nextUrl.searchParams.entries()) {
    out[k] = v;
  }
  return out;
}

/**
 * jsonRoute is the common case: JSON-in, JSON-out. Body and query are
 * Zod-validated and surface 400 with the first issue's message on failure.
 * The handler returns the response data; the factory wraps it in
 * NextResponse.json with the configured status (default 200).
 */
export function jsonRoute<
  P extends Params = Params,
  B = undefined,
  Q = undefined,
>(opts: {
  auth: AuthRule<P>;
  body?: ZodType<B>;
  query?: ZodType<Q>;
  status?: number;
  handler: (ctx: ApiContext<P> & { body: B; query: Q }) => unknown | Promise<unknown>;
}): NextRouteHandler<P> {
  return apiRoute<P>({
    auth: opts.auth,
    handler: async ({ request, params, session }) => {
      let body = undefined as unknown as B;
      if (opts.body) {
        const raw = await request.json().catch(() => undefined);
        body = await parseSchema(opts.body, raw);
      }
      let query = undefined as unknown as Q;
      if (opts.query) {
        query = await parseSchema(opts.query, searchParamsToObject(request));
      }
      const data = await opts.handler({
        request,
        params,
        session,
        body,
        query,
      });
      return NextResponse.json(data, { status: opts.status ?? 200 });
    },
  });
}

/**
 * multipartRoute parses request.formData() and passes it to the handler.
 * The handler returns JSON-serializable data; the factory wraps it.
 */
export function multipartRoute<P extends Params = Params>(opts: {
  auth: AuthRule<P>;
  status?: number;
  handler: (ctx: ApiContext<P> & { formData: FormData }) => unknown | Promise<unknown>;
}): NextRouteHandler<P> {
  return apiRoute<P>({
    auth: opts.auth,
    handler: async ({ request, params, session }) => {
      const formData = await request.formData();
      const data = await opts.handler({
        request,
        params,
        session,
        formData,
      });
      return NextResponse.json(data, { status: opts.status ?? 200 });
    },
  });
}

/**
 * binaryRoute returns a non-JSON Response built from a Node Readable or
 * web ReadableStream plus headers. The handler decides the content type
 * and disposition.
 */
export function binaryRoute<P extends Params = Params>(opts: {
  auth: AuthRule<P>;
  handler: (ctx: ApiContext<P>) =>
    | {
        body: ReadableStream<Uint8Array> | Blob | ArrayBuffer | string;
        headers: HeadersInit;
        status?: number;
      }
    | Promise<{
        body: ReadableStream<Uint8Array> | Blob | ArrayBuffer | string;
        headers: HeadersInit;
        status?: number;
      }>;
}): NextRouteHandler<P> {
  return apiRoute<P>({
    auth: opts.auth,
    handler: async (ctx) => {
      const { body, headers, status } = await opts.handler(ctx);
      return new Response(body, { headers, status: status ?? 200 });
    },
  });
}
