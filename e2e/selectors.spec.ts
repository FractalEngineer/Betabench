import { test, expect } from "@playwright/test";

test("one editable profile dropdown selects presets and saves the exact entered name", async ({
  page,
}) => {
  await page.goto("");
  const profile = page.getByRole("combobox", {
    name: "Throttle profile",
    exact: true,
  });
  await expect(profile).toHaveValue("MiniQuadTestBench");
  await expect(
    page.getByRole("textbox", { name: "Profile name", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Throttle profile options", exact: true })
    .click();
  await page
    .getByRole("option", { name: "0 → 100 → 0 sweep", exact: true })
    .click();
  await profile.fill("My bench curve");
  await profile.press("Enter");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("Profile saved locally", { exact: true }),
  ).toBeVisible();
  await expect(profile).toHaveValue("My bench curve");
  await page.reload();
  await profile.fill("My bench");
  await page
    .getByRole("option", { name: "My bench curve", exact: true })
    .click();
  await expect(profile).toHaveValue("My bench curve");
  await expect(page.getByLabel("Point 2 time", { exact: true })).toHaveValue(
    "6",
  );
});

test("target search starts empty, requires selection, supports keyboard and clears stale CLI", async ({
  page,
}) => {
  await page.goto("");
  await page.getByRole("button", { name: "Load cell", exact: true }).click();
  const target = page.getByRole("combobox", {
    name: "Flight controller target",
    exact: true,
  });
  await expect(target).toHaveValue("");
  await expect(page.getByTestId("resource-cli")).toHaveCount(0);
  await expect(
    page.getByLabel("HX711 clock (SCK)", { exact: true }),
  ).toHaveCount(0);
  await target.fill("not-a-board");
  await expect(page.getByText("No matches", { exact: true })).toBeVisible();
  await target.press("Enter");
  await expect(page.getByTestId("resource-cli")).toHaveCount(0);
  await target.fill("clracing f4");
  await expect(
    page.getByRole("option", { name: "CLRACINGF4", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("resource-cli")).toHaveCount(0);
  await target.press("ArrowDown");
  await target.press("Enter");
  await expect(target).toHaveValue("CLRACINGF4");
  await expect(page.getByTestId("resource-cli")).toHaveCount(0);
  await page
    .getByLabel("Current UART assignments", { exact: true })
    .fill("msp_1_uart = VCP\nrx_uart = UART1");
  await expect(page.getByTestId("resource-cli")).toContainText(
    "resource HX711_SCK",
  );
  await target.fill("SPEEDY");
  await expect(page.getByTestId("resource-cli")).toHaveCount(0);
  await expect(
    page.getByLabel("HX711 clock (SCK)", { exact: true }),
  ).toHaveCount(0);
  await target.fill("");
  await target.press("Escape");
  await expect(target).toHaveAttribute("aria-expanded", "false");
  await page.reload();
  await page.getByRole("button", { name: "Load cell", exact: true }).click();
  await expect(target).toHaveValue("");
});
