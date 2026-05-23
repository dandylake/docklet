import { type APIRequestContext } from "@playwright/test";
import { test, expect } from "./fixtures/auth.fixtures";
import { ContainersPage } from "./pom/ContainersPage";
import { CreateContainerPage } from "./pom/CreateContainerPage";
import { ContainerDetailPage } from "./pom/ContainerDetailPage";

// Container tests run serially: they create real Docker containers on the
// shared daemon and share one dev server, so parallel runs risk daemon
// contention and template-row collisions.
test.describe.configure({ mode: "serial" });

async function apiDeleteContainer(
  adminRequest: APIRequestContext,
  id: string
): Promise<void> {
  const res = await adminRequest.delete(`/api/containers/${id}?force=true`);
  if (!res.ok() && res.status() !== 404) {
    throw new Error(
      `delete container ${id} failed: ${res.status()} ${await res.text()}`
    );
  }
}

async function apiCreateContainer(
  adminRequest: APIRequestContext,
  name: string,
  image: string,
  cmd?: string[]
): Promise<string> {
  const res = await adminRequest.post("/api/containers", {
    data: { name, image, autoStart: false, ...(cmd ? { cmd } : {}) },
  });
  if (!res.ok()) {
    throw new Error(`create container failed: ${await res.text()}`);
  }
  const { id } = (await res.json()) as { id: string };
  return id;
}

async function apiDeleteTemplateByName(
  adminRequest: APIRequestContext,
  name: string
): Promise<void> {
  const listRes = await adminRequest.get("/api/templates");
  if (!listRes.ok()) return;
  const templates = (await listRes.json()) as Array<{ id: number; name: string }>;
  const match = templates.find((t) => t.name === name);
  if (!match) return;
  await adminRequest.delete(`/api/templates/${match.id}`);
}

test.describe("Create Container", () => {
  test("creates a container via the form, lands on detail page, and card appears in list", async ({
    adminPage,
    adminRequest,
  }) => {
    const create = new CreateContainerPage(adminPage);
    await create.goto();
    await create.fillBasic("e2e-create-ui", "alpine:latest");
    await create.submit();
    // Docker container ids are 64-char hex; min length 12 also excludes the
    // literal /containers/create route which would otherwise satisfy [a-f0-9]+.
    await expect(adminPage).toHaveURL(/\/containers\/[a-f0-9]{12,}$/);
    const match = adminPage.url().match(/\/containers\/([a-f0-9]{12,})$/);
    if (!match) throw new Error(`unexpected URL: ${adminPage.url()}`);
    const id = match[1];

    try {
      const containers = new ContainersPage(adminPage);
      await containers.goto();
      await expect(containers.getContainerCard("e2e-create-ui")).toBeVisible();
    } finally {
      await apiDeleteContainer(adminRequest, id);
    }
  });
});

test.describe("Container Lifecycle", () => {
  test("can start, stop, and restart a container from the detail page", async ({
    adminPage,
    adminRequest,
  }) => {
    const id = await apiCreateContainer(
      adminRequest,
      "e2e-lifecycle",
      "alpine:latest",
      ["sleep", "3600"]
    );
    try {
      const detail = new ContainerDetailPage(adminPage);

      await detail.goto(id);
      await detail.start();
      await expect(detail.statusBadge).toContainText(/running/i);

      await detail.stop();
      await expect(detail.statusBadge).toContainText(/exited|stopped/i);

      await detail.start();
      await detail.restart();
      await expect(detail.statusBadge).toContainText(/running/i);
    } finally {
      await apiDeleteContainer(adminRequest, id);
    }
  });
});

test.describe("Delete Container", () => {
  test("deletes a container from the detail page and removes it from the list", async ({
    adminPage,
    adminRequest,
  }) => {
    const id = await apiCreateContainer(
      adminRequest,
      "e2e-delete-ui",
      "alpine:latest",
      ["sleep", "3600"]
    );
    let deletedViaUi = false;
    try {
      const detail = new ContainerDetailPage(adminPage);
      await detail.goto(id);
      await detail.delete();
      deletedViaUi = true;
      await expect(adminPage).toHaveURL(/\/containers$/);
      const containers = new ContainersPage(adminPage);
      await expect(containers.getContainerCard("e2e-delete-ui")).toHaveCount(0);
    } finally {
      if (!deletedViaUi) await apiDeleteContainer(adminRequest, id);
    }
  });
});

test.describe("Template Save and Load", () => {
  const TEMPLATE_NAME = "My Redis Template";

  test("saves container config as template and loads it on a new form", async ({
    adminPage,
    adminRequest,
  }) => {
    try {
      const create = new CreateContainerPage(adminPage);
      await create.goto();
      await create.fillBasic("template-source", "redis:alpine");
      await create.saveAsTemplate(TEMPLATE_NAME);
      await create.goto();
      await create.loadTemplate(TEMPLATE_NAME);
      await expect(create.imageInput).toHaveValue("redis:alpine");
    } finally {
      // Without this, a CI retry would re-attempt saveAsTemplate against an
      // existing name and hang on the modal not closing.
      await apiDeleteTemplateByName(adminRequest, TEMPLATE_NAME);
    }
  });
});
