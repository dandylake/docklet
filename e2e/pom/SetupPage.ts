import { type Page, type Locator } from "@playwright/test";

export class SetupPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly submitButton: Locator;
  readonly successHeading: Locator;
  readonly dashboardButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.getByLabel("Admin Username");
    this.passwordInput = page.getByLabel("Password", { exact: true });
    this.confirmPasswordInput = page.getByLabel("Confirm Password");
    this.submitButton = page.getByRole("button", { name: "Create Admin Account" });
    this.successHeading = page.getByRole("heading", { name: "Setup Complete" });
    this.dashboardButton = page.getByRole("button", { name: "Go to Dashboard" });
  }

  async goto(): Promise<void> {
    await this.page.goto("/setup");
    await this.page.getByText(/Welcome to/).waitFor({ state: "visible" });
  }

  async fillForm(
    username: string,
    password: string,
    confirmPassword?: string
  ): Promise<void> {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.confirmPasswordInput.fill(confirmPassword ?? password);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }
}
