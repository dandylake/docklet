import { test, expect } from "./fixtures/auth.fixtures";
import { ImagesPage } from "./pom/ImagesPage";

test.describe("Image List", () => {
  test("images page loads for admin with Pull button", async ({
    adminPage,
  }) => {
    const images = new ImagesPage(adminPage);
    await images.goto();
    await expect(images.heading).toBeVisible();
    await expect(images.pullButton).toBeVisible();
  });
});

test.describe("Pull and Delete Image", () => {
  // hello-world is the smallest public image (a few KB); chosen to keep this
  // real-Docker test fast and reliable across networks.
  const TAG = "hello-world:latest";

  test("admin pulls hello-world and then deletes it from the list", async ({
    adminPage,
  }) => {
    const images = new ImagesPage(adminPage);
    await images.goto();
    await images.pullImage(TAG);
    await expect(images.getImageCard(TAG)).toBeVisible();
    await images.deleteImage(TAG);
    await expect(images.getImageCard(TAG)).toHaveCount(0);
  });
});
