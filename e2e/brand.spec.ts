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
  expect(await icon.text()).toContain(">B<tspan fill=\"#ffbb00\">B</tspan>");
  const wordmark = await page
    .locator(".brand-wordmark")
    .evaluate((image: HTMLImageElement) => image.currentSrc);
  expect((await request.get(wordmark)).status()).toBe(200);
});
