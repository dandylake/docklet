import { test, expect } from "./fixtures/auth.fixtures";

test.describe("Admin-only page access", () => {
  test("non-admin visiting /users is redirected to /containers", async ({
    userPage,
  }) => {
    await userPage.goto("/users");
    await expect(userPage).toHaveURL(/\/containers$/);
  });

  test("non-admin visiting /settings is redirected to /containers", async ({
    userPage,
  }) => {
    await userPage.goto("/settings");
    await expect(userPage).toHaveURL(/\/containers$/);
  });
});

test.describe("Sidebar navigation visibility", () => {
  test("admin sees Users and Settings links in sidebar", async ({
    adminPage,
  }) => {
    await adminPage.goto("/containers");
    await expect(
      adminPage.getByRole("link", { name: "Users" })
    ).toBeVisible();
    await expect(
      adminPage.getByRole("link", { name: "Settings" })
    ).toBeVisible();
  });

  test("regular user does not see Users or Settings in sidebar", async ({
    userPage,
  }) => {
    await userPage.goto("/containers");
    await expect(
      userPage.getByRole("link", { name: "Users" })
    ).not.toBeVisible();
    await expect(
      userPage.getByRole("link", { name: "Settings" })
    ).not.toBeVisible();
  });
});
