import { type Page, type Locator } from "@playwright/test";

export class ImagesPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly pullButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Images" });
    this.pullButton = page.getByRole("button", { name: "Pull Image" });
  }

  async goto(): Promise<void> {
    await this.page.goto("/images");
    await this.heading.waitFor({ state: "visible" });
  }

  getImageCards(): Locator {
    return this.page.getByTestId("image-card");
  }

  getImageCard(tagOrName: string): Locator {
    return this.getImageCards().filter({ hasText: tagOrName });
  }

  getDeleteButton(tagOrName: string): Locator {
    return this.getImageCard(tagOrName).getByRole("button", { name: "Delete image" });
  }

  async openPullModal(): Promise<void> {
    await this.pullButton.click();
    await this.page
      .getByRole("heading", { name: "Pull Image" })
      .waitFor({ state: "visible" });
  }

  async pullImage(tag: string, timeout = 120_000): Promise<void> {
    await this.openPullModal();
    await this.page.getByLabel("Image", { exact: true }).fill(tag);
    await this.page.getByRole("button", { name: "Pull", exact: true }).click();
    await this.page
      .getByRole("heading", { name: "Pull Image" })
      .waitFor({ state: "hidden", timeout });
  }

  async deleteImage(tagOrName: string): Promise<void> {
    await this.getDeleteButton(tagOrName).click();
    await this.page
      .getByRole("heading", { name: "Delete Image" })
      .waitFor({ state: "visible" });
    await this.page.getByRole("button", { name: "Delete", exact: true }).click();
    await this.getImageCard(tagOrName).waitFor({ state: "hidden", timeout: 15_000 });
  }
}
