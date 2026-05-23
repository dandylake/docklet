import { type APIRequestContext } from "@playwright/test";
import { test, expect } from "./fixtures/auth.fixtures";
import { SettingsPage } from "./pom/SettingsPage";
import { LoginPage } from "./pom/LoginPage";

async function restoreAppName(
  adminRequest: APIRequestContext,
  name: string
): Promise<void> {
  const res = await adminRequest.put("/api/settings", { data: { app_name: name } });
  if (!res.ok()) {
    throw new Error(
      `restoreAppName failed: ${res.status()} ${await res.text()}`
    );
  }
}

test.describe("App Name Setting", () => {
  test("updated app name persists on reload and shows on the login page", async ({
    adminPage,
    adminRequest,
  }) => {
    const originalRes = await adminRequest.get("/api/settings");
    if (!originalRes.ok()) {
      throw new Error(
        `fetch settings failed: ${originalRes.status()} ${await originalRes.text()}`
      );
    }
    const originalName =
      ((await originalRes.json()) as { app_name?: string }).app_name ?? "Docklet";

    try {
      const settings = new SettingsPage(adminPage);
      await settings.goto();
      await settings.updateAppName("MyDocklet");
      await adminPage.reload();
      await expect(settings.appNameInput).toHaveValue("MyDocklet");

      await adminPage.context().clearCookies();
      const login = new LoginPage(adminPage);
      await login.goto();
      await expect(login.appHeading()).toHaveText("MyDocklet");
    } finally {
      await restoreAppName(adminRequest, originalName);
    }
  });
});
