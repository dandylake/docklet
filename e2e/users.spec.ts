import { test, expect, ADMIN_CREDS } from "./fixtures/auth.fixtures";
import { UsersPage } from "./pom/UsersPage";

test.describe("User List", () => {
  test("admin row shows (you) label", async ({ adminPage }) => {
    const users = new UsersPage(adminPage);
    await users.goto();
    await expect(users.getUserRow(ADMIN_CREDS.username)).toContainText("(you)");
  });
});

test.describe("User Management", () => {
  test("admin creates a user, promotes them to mod, then deletes them", async ({
    adminPage,
  }) => {
    // Username deliberately avoids the substring "user" so that asserting the
    // role badge text via row content is not satisfied by the username itself.
    const target = "e2e-mgmt-target";
    const users = new UsersPage(adminPage);
    await users.goto();

    await users.createUser({ username: target, password: "crud-pass-12345" });
    await expect(users.getUserRow(target)).toContainText("user");

    await users.editUser(target, { role: "mod" });
    await expect(users.getUserRow(target)).toContainText("mod");

    await users.deleteUser(target);
    await expect(users.getUserRow(target)).toHaveCount(0);
  });
});
