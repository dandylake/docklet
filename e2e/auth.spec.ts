import { test, expect, ADMIN_CREDS } from "./fixtures/auth.fixtures";
import { LoginPage } from "./pom/LoginPage";
import { SetupPage } from "./pom/SetupPage";

// Setup Wizard tests must run serially: the first test creates the admin account
// and subsequent tests depend on that state (e.g. /setup redirects to /login).
test.describe.configure({ mode: "serial" });

test.describe("Setup Wizard", () => {
  test("completes setup and redirects to /containers via dashboard button", async ({
    page,
  }) => {
    const setup = new SetupPage(page);
    await setup.goto();
    await setup.fillForm(ADMIN_CREDS.username, ADMIN_CREDS.password);
    await setup.submit();
    await expect(setup.successHeading).toBeVisible();
    await setup.dashboardButton.click();
    await expect(page).toHaveURL(/\/containers/);
  });

  test("redirects /setup to /login once admin exists", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/setup");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Login", () => {
  test("logs in with valid credentials and redirects to /containers", async ({
    page,
  }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(ADMIN_CREDS.username, ADMIN_CREDS.password);
    await expect(page).toHaveURL(/\/containers/);
  });

  test("rejects invalid credentials with an inline error", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(ADMIN_CREDS.username, "wrong-password-xyz");
    await expect(login.errorMessage).toContainText(/invalid/i);
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Logout", () => {
  test("logs out via header user menu and redirects to /login", async ({
    adminPage,
  }) => {
    await adminPage.goto("/containers");
    await adminPage.getByRole("button", { name: ADMIN_CREDS.username }).click();
    await adminPage.getByRole("button", { name: "Sign out" }).click();
    await expect(adminPage).toHaveURL(/\/login/);
  });
});

test.describe("Redirect guards", () => {
  test("unauthenticated visit to /containers redirects to /login", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/containers");
    await expect(page).toHaveURL(/\/login/);
  });

  test("authenticated visit to /login redirects to /containers", async ({
    adminPage,
  }) => {
    await adminPage.goto("/login");
    await expect(adminPage).toHaveURL(/\/containers/);
  });
});
