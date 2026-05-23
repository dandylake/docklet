import { type Page, type Locator } from "@playwright/test";

export class SettingsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly appNameInput: Locator;
  readonly saveButton: Locator;
  readonly successMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Settings" });
    this.appNameInput = page.getByLabel("Application Name");
    this.saveButton = page.getByRole("button", { name: "Save Settings" });
    this.successMessage = page.getByTestId("success-message");
  }

  async goto(): Promise<void> {
    await this.page.goto("/settings");
    await this.heading.waitFor({ state: "visible" });
  }

  async updateAppName(name: string): Promise<void> {
    await this.appNameInput.clear();
    await this.appNameInput.fill(name);
    await this.saveButton.click();
    await this.successMessage.waitFor({ state: "visible" });
  }
}
