import { type Page, type Locator } from "@playwright/test";

export class ContainersPage {
  readonly page: Page;
  readonly heading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Containers" });
  }

  async goto(): Promise<void> {
    await this.page.goto("/containers");
    await this.heading.waitFor({ state: "visible" });
  }

  getContainerCards(): Locator {
    return this.page.getByTestId("container-card");
  }

  getContainerCard(name: string): Locator {
    return this.getContainerCards().filter({ hasText: name });
  }
}
