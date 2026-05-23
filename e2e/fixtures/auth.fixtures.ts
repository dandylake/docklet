/* eslint-disable react-hooks/rules-of-hooks */
import { test as base, type Page, type APIRequestContext } from "@playwright/test";

export const ADMIN_CREDS = {
  username: "e2e-admin",
  password: "e2epassword1",
} as const;
export const USER_CREDS = {
  username: "e2e-user",
  password: "e2epassword2",
} as const;
export const MOD_CREDS = {
  username: "e2e-mod",
  password: "e2epassword3",
} as const;

type Creds = { username: string; password: string };

type AuthFixtures = {
  adminPage: Page;
  userPage: Page;
  modPage: Page;
  adminRequest: APIRequestContext;
};

/**
 * Logs in via the API. Playwright stores the response's Set-Cookie in the
 * cookie jar of whichever context issued the request: page.request feeds the
 * browser context, a standalone APIRequestContext feeds itself. Either way the
 * caller is authenticated afterwards with no manual cookie handling.
 */
async function apiLogin(api: APIRequestContext, creds: Creds): Promise<void> {
  const res = await api.post("/api/auth/login", { data: creds });
  if (!res.ok()) {
    throw new Error(
      `apiLogin failed for ${creds.username}: ${res.status()} ${await res.text()}`
    );
  }
}

/**
 * Ensures the initial admin account exists. Idempotent: setup returns 400 once
 * an admin is present, which we ignore. A genuine failure surfaces later when
 * apiLogin cannot authenticate.
 */
async function ensureAdmin(api: APIRequestContext): Promise<void> {
  await api.post("/api/auth/setup", {
    data: {
      username: ADMIN_CREDS.username,
      password: ADMIN_CREDS.password,
      confirmPassword: ADMIN_CREDS.password,
    },
  });
}

/**
 * Ensures a non-admin user exists. Ignores 409 Conflict (already exists).
 */
async function ensureUser(
  adminApi: APIRequestContext,
  creds: Creds,
  role: "user" | "mod"
): Promise<void> {
  const res = await adminApi.post("/api/users", {
    data: { username: creds.username, password: creds.password, role },
  });
  if (!res.ok() && res.status() !== 409) {
    throw new Error(
      `ensureUser failed for ${creds.username}: ${res.status()} ${await res.text()}`
    );
  }
}

export const test = base.extend<AuthFixtures>({
  // An APIRequestContext authenticated as admin. Its cookie jar carries the
  // session, so specs make admin API calls without juggling cookie headers.
  adminRequest: async ({ request }, use) => {
    await ensureAdmin(request);
    await apiLogin(request, ADMIN_CREDS);
    await use(request);
  },

  adminPage: async ({ page }, use) => {
    await ensureAdmin(page.request);
    await apiLogin(page.request, ADMIN_CREDS);
    await use(page);
  },

  userPage: async ({ page, adminRequest }, use) => {
    await ensureUser(adminRequest, USER_CREDS, "user");
    await apiLogin(page.request, USER_CREDS);
    await use(page);
  },

  modPage: async ({ page, adminRequest }, use) => {
    await ensureUser(adminRequest, MOD_CREDS, "mod");
    await apiLogin(page.request, MOD_CREDS);
    await use(page);
  },
});

export { expect } from "@playwright/test";
