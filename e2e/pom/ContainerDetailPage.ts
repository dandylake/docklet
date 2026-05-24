import { type Page, type Locator } from "@playwright/test";

export class ContainerDetailPage {
  readonly page: Page;
  readonly startButton: Locator;
  readonly stopButton: Locator;
  readonly restartButton: Locator;
  readonly deleteButton: Locator;
  readonly statusBadge: Locator;
  readonly statsTabButton: Locator;
  readonly statsCpu: Locator;
  readonly statsMemory: Locator;

  constructor(page: Page) {
    this.page = page;
    this.startButton = page.getByRole("button", { name: "Start", exact: true });
    this.stopButton = page.getByRole("button", { name: "Stop", exact: true });
    this.restartButton = page.getByRole("button", { name: "Restart container" });
    this.deleteButton = page.getByRole("button", { name: "Delete container" });
    this.statusBadge = page.getByTestId("status-badge");
    this.statsTabButton = page.getByRole("button", { name: "Stats" });
    this.statsCpu = page.getByTestId("stats-cpu");
    this.statsMemory = page.getByTestId("stats-memory");
  }

  async goto(containerId: string): Promise<void> {
    await this.page.goto(`/containers/${containerId}`);
    await this.page
      .getByRole("button", { name: "Logs" })
      .waitFor({ state: "visible" });
  }

  async start(): Promise<void> {
    await this.startButton.click();
    await this.stopButton.waitFor({ state: "visible", timeout: 15_000 });
  }

  async stop(): Promise<void> {
    await this.stopButton.click();
    await this.startButton.waitFor({ state: "visible", timeout: 15_000 });
  }

  async restart(): Promise<void> {
    await this.restartButton.click();
    await this.stopButton.waitFor({ state: "visible", timeout: 15_000 });
  }

  async delete(): Promise<void> {
    await this.deleteButton.click();
    await this.page
      .getByRole("heading", { name: "Delete Container" })
      .waitFor({ state: "visible" });
    await this.page.getByRole("button", { name: "Delete" }).last().click();
    await this.page.waitForURL(/\/containers$/);
  }

  async openStatsTab(): Promise<void> {
    await this.statsTabButton.click();
    // Stats cards only mount after the first SSE frame arrives, so waiting for
    // the CPU testid proves the tab is open *and* the stream is producing.
    await this.statsCpu.waitFor({ state: "visible", timeout: 15_000 });
  }
}
