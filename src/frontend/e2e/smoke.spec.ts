import { expect, test } from "@playwright/test";

test.describe("storefront smoke", () => {
  test("home loads", async ({ page }) => {
    const res = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(res?.ok()).toBeTruthy();
    await expect(page.locator("body")).toBeVisible();
  });

  test("shop loads", async ({ page }) => {
    const res = await page.goto("/shop", { waitUntil: "domcontentloaded" });
    expect(res?.ok()).toBeTruthy();
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("cart page or panel route loads", async ({ page }) => {
    const res = await page.goto("/cart", { waitUntil: "domcontentloaded" });
    expect(res?.status() ?? 0).toBeLessThan(500);
    await expect(page.locator("body")).toBeVisible();
  });

  test("login loads", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("button", { name: "Sign in" }),
    ).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("admin gate", () => {
  test("unauthenticated /admin redirects to login", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto("/admin/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
    expect(page.url()).toMatch(/next=/);
  });
});
