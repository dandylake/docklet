import { type Page, type Locator } from "@playwright/test";

export type UserRole = "admin" | "mod" | "user";

export interface CreateUserData {
  username: string;
  password: string;
  role?: UserRole;
}

export interface EditUserData {
  role?: UserRole;
  password?: string;
}

export class UsersPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly newUserButton: Locator;
  readonly usersTable: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Users" });
    this.newUserButton = page.getByRole("button", { name: "New User" });
    this.usersTable = page.getByRole("table");
  }

  async goto(): Promise<void> {
    await this.page.goto("/users");
    await this.heading.waitFor({ state: "visible" });
  }

  getUsers(): Locator {
    // Includes the header row, but every consumer filters by username text so
    // the header (which has no username) cannot match.
    return this.usersTable.getByRole("row");
  }

  getUserRow(username: string): Locator {
    return this.getUsers().filter({ hasText: username });
  }

  getEditButton(username: string): Locator {
    return this.getUserRow(username).getByTitle("Edit");
  }

  getDeleteButton(username: string): Locator {
    // Self-row uses the disabled "Cannot delete yourself" title; both should
    // resolve to the same action column button.
    return this.getUserRow(username).getByTitle(/^(Delete|Cannot delete yourself)$/);
  }

  async openCreateModal(): Promise<void> {
    await this.newUserButton.click();
    await this.page
      .getByRole("heading", { name: "New User" })
      .waitFor({ state: "visible" });
  }

  async createUser(data: CreateUserData): Promise<void> {
    await this.openCreateModal();
    await this.page.getByLabel("Username").fill(data.username);
    await this.page.getByLabel("Password").fill(data.password);
    if (data.role && data.role !== "user") {
      await this.page.getByLabel("Role").selectOption(data.role);
    }
    await this.page.getByRole("button", { name: "Create" }).click();
    await this.page
      .getByRole("heading", { name: "New User" })
      .waitFor({ state: "hidden" });
    await this.getUserRow(data.username).waitFor({ state: "visible" });
  }

  async editUser(username: string, data: EditUserData): Promise<void> {
    await this.getEditButton(username).click();
    await this.page
      .getByRole("heading", { name: `Edit ${username}` })
      .waitFor({ state: "visible" });
    if (data.role) {
      await this.page.getByLabel("Role").selectOption(data.role);
    }
    if (data.password) {
      await this.page.getByLabel("Reset password").fill(data.password);
    }
    await this.page.getByRole("button", { name: "Save" }).click();
    await this.page
      .getByRole("heading", { name: `Edit ${username}` })
      .waitFor({ state: "hidden" });
  }

  async deleteUser(username: string): Promise<void> {
    await this.getDeleteButton(username).click();
    await this.page
      .getByRole("heading", { name: "Delete User" })
      .waitFor({ state: "visible" });
    await this.page.getByRole("button", { name: "Delete", exact: true }).click();
    await this.getUserRow(username).waitFor({ state: "hidden" });
  }
}
