import { test, expect } from "@playwright/test";

test("serves the BB favicon and the wordmark from the app base path", async ({
  page,
  request,
}) => {
  await page.goto("");
  const href = await page
    .locator('link[rel="icon"]')
    .evaluate((link: HTMLLinkElement) => link.href);
  expect(href).toContain("/brand/betabench-icon.svg");
  const icon = await request.get(href);
  expect(icon.status()).toBe(200);
  expect(icon.headers()["content-type"]).toContain("image/svg+xml");
  expect(await icon.text()).toContain('>B<tspan fill="#ffbb00">B</tspan>');
  const wordmark = await page
    .locator(".brand-wordmark")
    .evaluate((image: HTMLImageElement) => image.currentSrc);
  expect((await request.get(wordmark)).status()).toBe(200);
  await expect(
    page.getByRole("link", { name: "View BetaBench source on GitHub" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Collapse side menu" }).click();
  await expect(page.locator(".sidebar")).toHaveClass(/collapsed/);
  await expect(
    page.locator(".nav-label", { hasText: "Test bench" }),
  ).toBeHidden();
  await expect(page.locator(".brand-wordmark")).toHaveAttribute(
    "src",
    /betabench-icon\.svg$/,
  );
  await page.getByRole("button", { name: "Expand side menu" }).click();
  await expect(page.locator(".sidebar")).not.toHaveClass(/collapsed/);
});
