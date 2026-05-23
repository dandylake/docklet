import { type Page, type Locator } from "@playwright/test";

export class CreateContainerPage {
  readonly page: Page;
  readonly nameInput: Locator;
  readonly imageInput: Locator;
  readonly createButton: Locator;
  readonly loadTemplateButton: Locator;
  readonly saveTemplateButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nameInput = page.getByLabel("Container Name");
    this.imageInput = page.getByLabel("Image");
    this.createButton = page.getByRole("button", { name: "Create", exact: true });
    this.loadTemplateButton = page.getByRole("button", { name: "Load Template" });
    this.saveTemplateButton = page.getByRole("button", { name: "Save Template" });
  }

  async goto(): Promise<void> {
    await this.page.goto("/containers/create");
    await this.page
      .getByRole("heading", { name: "Create Container" })
      .waitFor({ state: "visible" });
  }

  async fillBasic(name: string, image: string): Promise<void> {
    await this.nameInput.fill(name);
    await this.imageInput.fill(image);
  }

  async submit(): Promise<void> {
    await this.createButton.click();
  }

  async loadTemplate(templateName: string): Promise<void> {
    await this.loadTemplateButton.click();
    await this.page
      .getByRole("heading", { name: "Load Template" })
      .waitFor({ state: "visible" });
    await this.page.getByRole("button", { name: templateName }).click();
  }

  async saveAsTemplate(templateName: string): Promise<void> {
    await this.saveTemplateButton.click();
    await this.page
      .getByRole("heading", { name: "Save Template" })
      .waitFor({ state: "visible" });
    await this.page.getByLabel("Template Name").fill(templateName);
    await this.page.getByRole("button", { name: "Save", exact: true }).click();
    await this.page
      .getByRole("heading", { name: "Save Template" })
      .waitFor({ state: "hidden" });
  }
}
